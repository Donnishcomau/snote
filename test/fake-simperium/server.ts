/**
 * Fake Simperium server for testing.
 * Implements the wire protocol from docs/reference/simperium-wire.md
 */
import { WebSocketServer, type WebSocket } from 'ws';
import * as http from 'http';
import { JSONDiff } from 'simperium/lib/simperium/jsondiff/jsondiff';
import { randomUUID } from 'node:crypto';

// Valid test token → email mapping
const VALID_TOKENS = new Map<string, string>([
  ['test-token', 'test@example.com'],
  ['good', 'user@example.com'],
  // T296: distinct tokens per account so dropClient(email) can match one
  // connection (conn.email is derived from the token, not the client's claim).
  ['store1-token', 'store1@example.com'],
  ['store2-token', 'store2@example.com'],
]);

// Server-side storage: per app, per bucket, id → {version, data, history[]}
type BucketEntry = {
  version: number;
  data: Record<string, unknown>;
  history: Array<{ version: number; data: Record<string, unknown> }>;
};

type Bucket = {
  entries: Map<string, BucketEntry>;
  cv: number; // monotonically increasing change version counter
  cvString: string; // string representation for protocol
  log: BroadcastChange[]; // T66: log of applied changes for cv resume
  // T319: id → full version history kept after `serverRemove` deletes the
  // entry, so `e:<id>.<version>` can still answer old versions of removed
  // objects (the real service does, and that is how live notes came back).
  removed?: Map<string, Array<{ version: number; data: Record<string, unknown> }>>;
};

type AppStorage = Map<string, Bucket>; // bucket name → Bucket

type Connection = {
  channel: number;
  bucket: string | null;
  authenticated: boolean;
  email: string | null;
  // Track CCIDs seen by this connection for duplicate detection
  seenCcid: Set<string>;
  // WebSocket reference for broadcasting
  ws: WebSocket | null;
};

// Change types
type Change = {
  o: 'M' | '-'; // Modify or Remove
  id: string;
  ccid: string;
  v?: Record<string, unknown>; // Patch for modify
  sv?: number; // Source version
  d?: Record<string, unknown>; // Full object (client's full resend)
};

// Acknowledgement
type Ack = {
  ccid: string;
  id: string;
  ccids: string[];
  error?: number;
};

// Broadcast change
type BroadcastChange = {
  id: string;
  o: 'M' | '-';
  v?: Record<string, unknown>;
  sv?: number; // T64: optional for new objects (client applies only when sv equals held version)
  ev: number; // Entity version (new version after apply)
  cv: string;
  ccids: string[];
  clientid: string;
};

// Singleton JSONDiff instance
const jsonDiff = new JSONDiff();

export class FakeSimperiumServer {
  /** Delay (ms) before answering a `cv:` catch-up request; 0 = immediate (default). */
  catchUpDelayMs = 0;
  /**
   * T313/T314 — opt-in: when true, a `cv:` catch-up request that has no
   * changes to report (since === bucket.cv, i.e. the client is already
   * current) is silently swallowed — no `c:[]` reply is sent at all.
   * Live trials on the real Simplenote service (5 real "edit offline,
   * close, another device edits, reopen" runs, 1/5 lost the offline edit)
   * showed the client's note channel can go a whole session without ever
   * emitting 'ready'. Normally `handleCV` below always answers with
   * `c:[...]` (even `c:[]`), and `Channel.prototype.onChanges`
   * (node_modules/simperium/lib/simperium/channel.js:702-714) emits
   * 'ready' unconditionally after handling ANY `c:` reply, including an
   * empty one — so a merely-empty reply is not the failure mode. What
   * reproduces the live hang is the reply never arriving at all (dropped,
   * or the real service's degenerate no-op path for "nothing changed"),
   * so `onChanges` never runs and 'ready' never fires. This flag
   * simulates exactly that: the request is received and authenticated,
   * but no reply is ever sent for it.
   */
  dropEmptyCatchUpReply = false;
  /**
   * T319: when > 0, every `e:` (entity/version) reply is sent this many
   * ms after the request, so a catch-up version request can be answered
   * AFTER the REMOVE queued behind it has already been applied.
   */
  versionReplyDelayMs = 0;
  /**
   * T319: records `<id>.<version>` for every `e:` reply sent WITH data
   * (never the `?` not-found answers), in the order they were sent.
   */
  versionRepliesSent: string[] = [];
  /**
   * T320: when > 0, for the FIRST N connections the server never replies
   * to init messages (neither the `N:init:` form nor the legacy `init:`
   * form) — the login just hangs — while heartbeats keep being answered,
   * exactly like the live stuck starts the auth watchdog recovers from.
   * Connections opened while this is 0 are never ignored, so arm it before
   * the client's first socket opens.
   */
  /** T320: for the first N websocket CONNECTIONS, ignore every init
   * message (no auth reply at all) while heartbeats keep being answered.
   * Per-connection, not per-message: see `handleInit`. */
  ignoreInitConnections = 0;
  /** T320: counts every new websocket connection opened against this server */
  connectionsOpened = 0;
  private httpServer: http.Server | null = null;
  private wsServer: WebSocketServer | null = null;
  private connections: Set<Connection> = new Set();
  private storage: Map<string, AppStorage> = new Map(); // app_id → (bucket → data)
  private channelBuckets: Map<number, string> = new Map(); // channel → bucket name
  private connectionChannels: Map<Connection, Set<number>> = new Map(); // connection → set of channels
  private nextMark = 1; // for pagination
  /** Public log of every raw message received, in order */
  received: string[] = [];
  /** T302: counts every `-` (remove) change received per id, existing or missing */
  removesReceived: Map<string, number> = new Map();
  /** Public record of every HTTP request (method, url, apiKey, body) */
  httpRequests: Array<{ method: string; url: string; apiKey: string | undefined; body: Record<string, unknown> | null }> = [];

  /** Start the server, returns port and URL */
  async start(): Promise<{ port: number; url: string }> {
    return new Promise((resolve, reject) => {
      this.httpServer = http.createServer((req, res) => {
        this.handleHttp(req, res);
      });

      this.httpServer.on('error', reject);

      this.httpServer.listen(0, () => {
        const port = (this.httpServer!.address() as any).port as number;
        const url = `ws://localhost:${port}`;

        this.wsServer = new WebSocketServer({ server: this.httpServer });

        this.wsServer.on('connection', (ws: WebSocket) => {
          this.handleConnection(ws);
        });

        resolve({ port, url });
      });
    });
  }

  /** Stop the server */
  stop(): void {
    this.connections.clear();
    if (this.wsServer) {
      this.wsServer.close();
      this.wsServer = null;
    }
    if (this.httpServer) {
      this.httpServer.close();
      this.httpServer = null;
    }
  }

  /** Seed a bucket with notes */
  seedBucket(
    appId: string,
    bucketName: string,
    notes: Array<{ id: string; data: Record<string, unknown>; version?: number }>
  ): void {
    let apps = this.storage.get(appId);
    if (!apps) {
      apps = new Map();
      this.storage.set(appId, apps);
    }

    let bucket = apps.get(bucketName);
    if (!bucket) {
      bucket = { entries: new Map(), cv: 0, cvString: '0', log: [], removed: new Map() };
      apps.set(bucketName, bucket);
    }

    for (const note of notes) {
      const version = note.version ?? (bucket.entries.size + 1);
      const entry: BucketEntry = {
        version,
        data: note.data,
        history: [],
      };
      bucket.entries.set(note.id, entry);
      bucket.cv++;
      bucket.cvString = String(bucket.cv);
    }
  }

  /**
   * T301: delete an object from a bucket's index (the map a re-index page
   * is built from) and bump the bucket's cv, WITHOUT pushing anything to
   * `log` and WITHOUT broadcasting. This simulates a removal whose
   * change-log entry has already rotated out of history — exactly the
   * state a real server is in when a long-offline client reconnects and
   * must learn about the deletion from a full re-index alone.
   */
  removeFromIndex(appId: string, bucketName: string, id: string): void {
    const apps = this.storage.get(appId);
    if (!apps) {
      return;
    }
    const bucket = apps.get(bucketName);
    if (!bucket) {
      return;
    }
    if (bucket.entries.delete(id)) {
      bucket.cv++;
      bucket.cvString = String(bucket.cv);
    }
  }

  /** Get the current CV for a bucket */
  getCV(appId: string, bucketName: string): string {
    const apps = this.storage.get(appId);
    if (!apps) return '0';
    const bucket = apps.get(bucketName);
    return bucket?.cvString ?? '0';
  }

  /**
   * T296: simulate a dropped connection for one account — close every
   * open socket of connections authenticated as `email`. The client's
   * ReconnectionTimer reconnects on its own (~1 s later).
   */
  dropClient(email: string): void {
    for (const conn of this.connections) {
      if (conn.email === email && conn.ws) {
        conn.ws.close();
      }
    }
  }

  private handleHttp(req: http.IncomingMessage, res: http.ServerResponse): void {
    const method = req.method ?? 'GET';
    const url = req.url ?? '/';
    const apiKey = req.headers['x-simperium-api-key'];

    function pushRecord(body: Record<string, unknown> | null): void {
      this.httpRequests.push({ method, url, apiKey: Array.isArray(apiKey) ? apiKey[0] : apiKey, body });
    }

    // POST /account/request-login
    if (method === 'POST' && url === '/account/request-login') {
      let body = '';
      const self = this;
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        let parsed: Record<string, unknown> | null = null;
        try {
          parsed = JSON.parse(body) as Record<string, unknown>;
          if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) parsed = null;
        } catch {
          parsed = null;
        }
        pushRecord.call(self, parsed);
        if (parsed && typeof (parsed.username) === 'string' && parsed.username.length > 0) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({}));
        } else {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({}));
        }
      });
      return;
    }

    // POST /account/complete-login
    if (method === 'POST' && url === '/account/complete-login') {
      let body = '';
      const self = this;
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        let parsed: Record<string, unknown> | null = null;
        try {
          parsed = JSON.parse(body) as Record<string, unknown>;
          if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) parsed = null;
        } catch {
          parsed = null;
        }
        pushRecord.call(self, parsed);
        if (parsed === null || !parsed.username) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({}));
          return;
        }
        if ((parsed.auth_code as string) === 'ABC123') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ sync_token: 'test-token' }));
        } else {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ code: 401, message: 'Invalid auth code' }));
        }
      });
      return;
    }

    // POST /1/<anything>/authorize/
    if (method === 'POST' && /^\/1\/[^/]+\/authorize\/$/.test(url)) {
      let body = '';
      const self = this;
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        let parsed: Record<string, unknown> | null = null;
        try {
          parsed = JSON.parse(body) as Record<string, unknown>;
          if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) parsed = null;
        } catch {
          parsed = null;
        }
        pushRecord.call(self, parsed);
        if (!apiKey) {
          res.writeHead(401, { 'Content-Type': 'text/plain' });
          res.end('missing api key');
          return;
        }
        if (parsed && (parsed.password as string) === 'correct-horse') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ access_token: 'test-token', userid: 'u1' }));
        } else {
          res.writeHead(401, { 'Content-Type': 'text/plain' });
          res.end('invalid login');
        }
      });
      return;
    }

    // Anything else → 404
    pushRecord.call(this, null);
    res.writeHead(404);
    res.end();
  }

  private handleConnection(ws: WebSocket): void {
    const conn: Connection = {
      channel: -1,
      bucket: null,
      authenticated: false,
      email: null,
      seenCcid: new Set<string>(),
      ws: null,
    };
    conn.ws = ws; // Set ws after conn is created
    this.connections.add(conn);
    this.connectionsOpened++; // T320

    ws.on('message', (data: Buffer) => {
      const message = data.toString();
      // Record every raw message received
      this.received.push(message);
      this.handleMessage(conn, ws, message);
    });

    ws.on('close', () => {
      this.connections.delete(conn);
    });

    ws.on('error', (err) => {
      console.error('[TEST] WebSocket error:', err);
    });
  }

  private handleMessage(conn: Connection, ws: WebSocket, message: string): void {
    // Split at FIRST colon only
    const firstColon = message.indexOf(':');
    if (firstColon === -1) {
      // Invalid message, ignore
      return;
    }

    const channelOrCommand = message.slice(0, firstColon);
    const payload = message.slice(firstColon + 1);

    // Heartbeat: h:<n>
    if (channelOrCommand === 'h') {
      const n = parseInt(payload, 10);
      if (!isNaN(n)) {
        this.send(ws, `h:${n + 1}`);
      }
      return;
    }

    // Parse channel and command: <channel>:<command>:<rest>
    const channel = parseInt(channelOrCommand, 10);
    if (isNaN(channel)) {
      // Check for unchannel-prefixed commands (legacy or special cases)
      if (channelOrCommand === 'init') {
        if (conn.channel < 0) {
          conn.channel = 0;
        }
        this.handleInit(conn, ws, payload, conn.channel);
        return;
      }
      return;
    }

    // Track channel assignment (first channel seen for this connection)
    if (conn.channel < 0) {
      conn.channel = channel;
      this.connectionChannels.set(conn, new Set([channel]));
    } else {
      this.connectionChannels.get(conn)?.add(channel);
    }

    const secondColon = payload.indexOf(':');
    if (secondColon === -1) {
      // Command without payload
      return;
    }

    const command = payload.slice(0, secondColon);
    const data = payload.slice(secondColon + 1);

    switch (command) {
      case 'init':
        this.handleInit(conn, ws, data, channel);
        break;
      case 'i':
        this.handleIndex(conn, ws, data, channel);
        break;
      case 'cv':
        // T313/T314: a real server answers the catch-up request after a network round
        // trip; `catchUpDelayMs` reproduces that so a client's resend can race it.
        if (this.catchUpDelayMs > 0) {
          setTimeout(() => this.handleCV(conn, ws, data, channel), this.catchUpDelayMs);
        } else {
          this.handleCV(conn, ws, data, channel);
        }
        break;
      case 'e':
        this.handleEntityFetch(conn, ws, data, channel);
        break;
      case 'c':
        // Client sending changes - for T03
        this.handleChange(conn, ws, data, channel);
        break;
    }
  }

  private handleInit(conn: Connection, ws: WebSocket, data: string, channel: number): void {
    // T320: for the first `ignoreInitConnections` websocket connections
    // (this one's index is `connectionsOpened`, already bumped when the
    // socket opened), swallow the init entirely — both the `N:init:` and
    // legacy `init:` forms route here — with no auth reply at all, while
    // heartbeats keep being answered.
    if (this.connectionsOpened <= this.ignoreInitConnections) {
      return;
    }
    let init: { token: string; app_id: string; name: string };
    try {
      init = JSON.parse(data);
    } catch {
      this.send(ws, `${channel}:auth:{"code":401,"msg":"Invalid init"}`);
      return;
    }

    const token = init.token;
    // Extract app_id from token (format: "test-token" → "test-app")
    // For testing, we use a fixed appId
    const appId = 'test-app';
    const email = VALID_TOKENS.get(token);

    if (!email) {
      this.send(ws, `${channel}:auth:{"code":401,"msg":"Invalid token"}`);
      return;
    }

    conn.authenticated = true;
    conn.email = email;
    conn.bucket = init.name;
    this.channelBuckets.set(channel, init.name);

    // Ensure storage exists for this app
    if (!this.storage.has(appId)) {
      this.storage.set(appId, new Map());
    }

    this.send(ws, `${channel}:auth:${email}`);
  }

  private handleIndex(conn: Connection, ws: WebSocket, data: string, channel: number): void {
    if (!conn.authenticated || !conn.email) {
      return;
    }

    // Parse: 1:<mark>::<page_size>
    const parts = data.split(':');
    if (parts.length < 3) {
      return;
    }

    const mark = parts[1];
    const pageSize = parseInt(parts[2] || '10', 10);

    // Get all entries for this bucket
    const appId = 'test-app';
    const bucketName = this.channelBuckets.get(channel) || 'note';
    const apps = this.storage.get(appId);
    if (!apps) {
      this.sendIndexResponse(ws, channel, [], '0', null);
      return;
    }

    const bucket = apps.get(bucketName);
    if (!bucket) {
      this.sendIndexResponse(ws, channel, [], '0', null);
      return;
    }

    // Convert to array and paginate
    const entries = Array.from(bucket.entries.entries());
    const startIndex = mark === '' ? 0 : parseInt(mark, 10);
    const pageEntries = entries.slice(startIndex, startIndex + pageSize);

    const index = pageEntries.map(([id, entry]) => ({
      id,
      v: entry.version,
      d: entry.data,
    }));

    const nextMark = startIndex + pageEntries.length;
    const hasMore = nextMark < entries.length;

    this.sendIndexResponse(ws, channel, index, bucket.cvString, hasMore ? String(nextMark) : null);
  }

  private sendIndexResponse(
    ws: WebSocket,
    channel: number,
    index: Array<{ id: string; v: number; d: Record<string, unknown> }>,
    cv: string,
    mark: string | null
  ): void {
    const response: { index: typeof index; current: string; mark?: string } = {
      index,
      current: cv,
    };
    if (mark !== null) {
      response.mark = mark;
    }
    this.send(ws, `${channel}:i:${JSON.stringify(response)}`);
  }

  private handleCV(conn: Connection, ws: WebSocket, data: string, channel: number): void {
    if (!conn.authenticated || !conn.email) {
      return;
    }

    const appId = 'test-app';
    const bucketName = this.channelBuckets.get(channel) || 'note';
    const apps = this.storage.get(appId);
    if (!apps) {
      this.send(ws, `${channel}:cv:?`);
      return;
    }

    const bucket = apps.get(bucketName);
    if (!bucket) {
      this.send(ws, `${channel}:cv:?`);
      return;
    }

    // T66: Parse CV and return changes since that CV
    const since = Number(data);
    // If cv is not a whole number or is greater than current cv, return cv:?
    if (!Number.isInteger(since) || since > bucket.cv) {
      this.send(ws, `${channel}:cv:?`);
      return;
    }
    // Return changes from log with cv > since
    const changes = bucket.log.filter((c) => Number(c.cv) > since);
    if (this.dropEmptyCatchUpReply && changes.length === 0) {
      // See the `dropEmptyCatchUpReply` doc comment: simulate a reply that
      // never arrives, instead of the usual `c:[]`.
      return;
    }
    this.send(ws, `${channel}:c:${JSON.stringify(changes)}`);
  }

  private handleEntityFetch(conn: Connection, ws: WebSocket, data: string, channel: number): void {
    if (!conn.authenticated) {
      return;
    }

    // Parse: <id>.<version>
    const dotIndex = data.lastIndexOf('.');
    if (dotIndex === -1) {
      return;
    }

    const id = data.slice(0, dotIndex);
    const versionStr = data.slice(dotIndex + 1);
    const version = parseInt(versionStr, 10);

    // T281: spec-strict — a non-numeric version token (e.g. the
    // `e:<id>.undefined` a brand-new object's own echo triggers) is an
    // "invalid version" request; answer `\n?` immediately, before the
    // "fetch current version" fallback below.
    if (versionStr !== String(version)) {
      this.send(ws, `${channel}:e:${data}\n?`);
      return;
    }

    const appId = 'test-app';
    const bucketName = this.channelBuckets.get(channel) || 'note';
    const apps = this.storage.get(appId);
    if (!apps) {
      this.send(ws, `${channel}:e:${data}\n?`);
      return;
    }

    const bucket = apps.get(bucketName);
    if (!bucket) {
      this.send(ws, `${channel}:e:${data}\n?`);
      return;
    }

    const entry = bucket.entries.get(id);

    // Resolve the reply body for this request (null = the `?` not-found
    // answer). T319: an id no longer in `entries` is answered from the
    // per-bucket removed-objects history — the real service keeps
    // answering old versions of removed notes.
    const resolveEntity = (): { data: Record<string, unknown> } | null => {
      // If fetching specific version from history
      if (!isNaN(version) && version > 0) {
        // Check if it's the current version
        if (entry && entry.version === version) {
          return { data: entry.data };
        }

        // Look in history
        const historyEntry = entry?.history.find((h) => h.version === version);
        if (historyEntry) {
          return { data: historyEntry.data };
        }

        // T319: not in `entries` anymore — answer from the removed history.
        const removedEntry = bucket.removed?.get(id)?.find((h) => h.version === version);
        if (removedEntry) {
          return { data: removedEntry.data };
        }

        // Version not found
        return null;
      }

      // Fetch current version
      if (!entry) {
        return null;
      }

      return { data: entry.data };
    };

    const sendReply = (body: { data: Record<string, unknown> } | null): void => {
      if (body !== null) {
        this.versionRepliesSent.push(data);
        this.send(ws, `${channel}:e:${data}\n${JSON.stringify(body)}`);
      } else {
        this.send(ws, `${channel}:e:${data}\n?`);
      }
    };

    const body = resolveEntity();
    // T319: a real service answers the version request after a network
    // round trip; `versionReplyDelayMs` lets the reply land after the
    // REMOVE queued behind it on the client.
    if (this.versionReplyDelayMs > 0) {
      setTimeout(() => sendReply(body), this.versionReplyDelayMs);
    } else {
      sendReply(body);
    }
  }

  private handleChange(conn: Connection, ws: WebSocket, data: string, channel: number): void {
    if (!conn.authenticated || !conn.email) {
      return;
    }

    // Parse change
    let change: Change;
    try {
      change = JSON.parse(data);
    } catch {
      return;
    }

    const appId = 'test-app';
    const bucketName = this.channelBuckets.get(channel) || 'note';
    const apps = this.storage.get(appId);
    if (!apps) {
      return;
    }

    let bucket = apps.get(bucketName);
    if (!bucket) {
      // Create missing bucket (T64: allow new objects in buckets that don't exist yet)
      bucket = { entries: new Map(), cv: 0, cvString: '0', log: [], removed: new Map() };
      apps.set(bucketName, bucket);
    }

    // Check for duplicate CCID
    if (conn.seenCcid.has(change.ccid)) {
      // Send 409 error
      const ack: Ack = {
        ccid: change.ccid,
        id: change.id,
        ccids: [change.ccid],
        error: 409,
      };
      this.send(ws, `${channel}:c:[${JSON.stringify(ack)}]`);
      return;
    }

    const entry = bucket.entries.get(change.id);

    // Handle remove
    if (change.o === '-') {
      // T302: count every remove received for this id, existing or missing
      this.removesReceived.set(change.id, (this.removesReceived.get(change.id) ?? 0) + 1);

      // T302: the bucket no longer holds this id. Acknowledge the sender
      // with 412 (the client library treats it as "change causes no
      // change, just acknowledge it") and do NOT broadcast — broadcasting
      // would make the other client echo the remove back and the two
      // clients would ping-pong forever.
      if (!entry) {
        const notFound: Ack = {
          ccid: change.ccid,
          id: change.id,
          ccids: [change.ccid],
          error: 412,
        };
        this.send(ws, `${channel}:c:[${JSON.stringify(notFound)}]`);
        return;
      }

      // Save to history before removing
      entry.history.push({ version: entry.version, data: { ...entry.data } });
      bucket.entries.delete(change.id);
      bucket.cv++;
      bucket.cvString = String(bucket.cv);

      // Mark CCID as seen
      conn.seenCcid.add(change.ccid);

      // Broadcast to all connections
      const broadcast: BroadcastChange = {
        id: change.id,
        o: '-',
        sv: change.sv ?? 0,
        ev: entry?.version ?? 0,
        cv: bucket.cvString,
        ccids: [change.ccid],
        clientid: conn.email,
      };
      bucket.log.push(broadcast);
      this.broadcastChange(broadcast, bucketName);
      return;
    }

    // Handle modify
    if (change.o === 'M') {
      // T64: Handle new object creation when entry doesn't exist
      if (!entry) {
        // Apply the patch to empty object to get full data
        const patch = change.v ?? {};
        const data = jsonDiff.apply_object_diff({}, patch);

        // Create new entry with version 1
        const newEntry: BucketEntry = {
          version: 1,
          data,
          history: [],
        };
        bucket.entries.set(change.id, newEntry);

        // Bump CV
        bucket.cv++;
        bucket.cvString = String(bucket.cv);

        // Mark CCID as seen
        conn.seenCcid.add(change.ccid);

        // Broadcast to all connections - NO sv field for new objects
        // (client applies only when sv equals held version, which is undefined for new objects)
        const broadcast: BroadcastChange = {
          id: change.id,
          o: 'M',
          v: patch,
          ev: 1,
          cv: bucket.cvString,
          ccids: [change.ccid],
          clientid: conn.email,
        };
        bucket.log.push(broadcast);
        this.broadcastChange(broadcast, bucketName);
        return;
      }

      // Check source version matches
      if (change.sv !== undefined && change.sv !== entry.version) {
        // T296: the real service rejects a change whose source version is
        // stale (error 405) and does NOT apply the patch or bump versions;
        // reproduce that so the reconnect race is observable in tests.
        const ack: Ack = {
          ccid: change.ccid,
          id: change.id,
          ccids: [change.ccid],
          error: 405,
        };
        this.send(ws, `${channel}:c:[${JSON.stringify(ack)}]`);
        return;
      }

      // T296: a full-object resend (a change carrying `d`, the object the
      // client wants it to hold) replaces the entry instead of patching it.
      if (change.d !== undefined && change.d !== null) {
        entry.history.push({ version: entry.version, data: { ...entry.data } });
        entry.version++;
        entry.data = { ...change.d };
        bucket.cv++;
        bucket.cvString = String(bucket.cv);
        conn.seenCcid.add(change.ccid);
        const fullBroadcast: BroadcastChange = {
          id: change.id,
          o: 'M',
          v: jsonDiff.object_diff(
            entry.history[entry.history.length - 1].data,
            entry.data
          ),
          sv: entry.version - 1,
          ev: entry.version,
          cv: bucket.cvString,
          ccids: [change.ccid],
          clientid: conn.email,
        };
        bucket.log.push(fullBroadcast);
        this.broadcastChange(fullBroadcast, bucketName);
        return;
      }

      // Apply the patch
      const patch = change.v ?? {};
      const newData = jsonDiff.apply_object_diff(entry.data, patch);

      // Save old version to history
      entry.history.push({ version: entry.version, data: { ...entry.data } });

      // Update entry
      entry.version++;
      entry.data = newData;
      bucket.cv++;
      bucket.cvString = String(bucket.cv);

      // Mark CCID as seen
      conn.seenCcid.add(change.ccid);

      // Broadcast to all connections
      const broadcast: BroadcastChange = {
        id: change.id,
        o: 'M',
        v: patch,
        sv: change.sv ?? 0,
        ev: entry.version,
        cv: bucket.cvString,
        ccids: [change.ccid],
        clientid: conn.email,
      };
      bucket.log.push(broadcast);
      this.broadcastChange(broadcast, bucketName);
      return;
    }
  }

  /** Broadcast change to all connections in the same bucket only */
  private broadcastChange(change: BroadcastChange, bucketName: string): void {
    for (const conn of this.connections) {
      if (conn.ws && conn.ws.readyState === conn.ws.OPEN) {
        // Only broadcast on channels whose bucket matches the change's bucket
        const channels = this.connectionChannels.get(conn);
        const channelsToUse = channels && channels.size > 0 ? channels : new Set([conn.channel]);
        for (const ch of channelsToUse) {
          if ((this.channelBuckets.get(ch) ?? 'note') === bucketName) {
            const message = `${ch}:c:[${JSON.stringify(change)}]`;
            this.send(conn.ws, message);
          }
        }
      }
    }
  }

  private send(ws: WebSocket, message: string): void {
    if (ws.readyState === ws.OPEN) {
      ws.send(message);
    }
  }

  /** Get the server URL (for test configuration) */
  get url(): string {
    if (!this.httpServer) {
      throw new Error('Server not started');
    }
    const addr = this.httpServer.address();
    if (!addr || typeof addr === 'string') {
      throw new Error('Server address not available');
    }
    return `ws://localhost:${addr.port}`;
  }

  /** Get an object from the server storage (for test assertions) */
  getObject(
    appId: string,
    bucketName: string,
    id: string
  ): { version: number; data: Record<string, unknown> } | undefined {
    const apps = this.storage.get(appId);
    if (!apps) {
      return undefined;
    }
    const bucket = apps.get(bucketName);
    if (!bucket) {
      return undefined;
    }
    const entry = bucket.entries.get(id);
    if (!entry) {
      return undefined;
    }
    return { version: entry.version, data: { ...entry.data } };
  }

  /** Apply a change "from the server" (another device) and broadcast to all connections */
  serverChange(
    bucketName: string,
    id: string,
    data: Record<string, unknown>
  ): number {
    const apps = this.storage.get('test-app');
    if (!apps) {
      throw new Error('serverChange: unknown object ' + id);
    }
    const bucket = apps.get(bucketName);
    if (!bucket) {
      throw new Error('serverChange: unknown object ' + id);
    }
    const entry = bucket.entries.get(id);
    if (!entry) {
      throw new Error('serverChange: unknown object ' + id);
    }

    const patch = jsonDiff.object_diff(entry.data, data);
    if (Object.keys(patch).length === 0) {
      return entry.version;
    }

    // Save old version to history
    entry.history.push({ version: entry.version, data: { ...entry.data } });

    // Update entry
    entry.version++;
    entry.data = data;
    bucket.cv++;
    bucket.cvString = String(bucket.cv);

    // Find the channel number for this bucket
    let ch = 0;
    for (const [channel, name] of this.channelBuckets) {
      if (name === bucketName) {
        ch = channel;
        break;
      }
    }

    // Build and broadcast the change
    const broadcast: BroadcastChange = {
      id,
      o: 'M',
      v: patch,
      sv: entry.version - 1,
      ev: entry.version,
      cv: bucket.cvString,
      ccids: [randomUUID()],
      clientid: 'server',
    };

    bucket.log.push(broadcast);

    for (const conn of this.connections) {
      if (conn.ws && conn.ws.readyState === conn.ws.OPEN) {
        this.send(conn.ws, `${ch}:c:[${JSON.stringify(broadcast)}]`);
      }
    }

    return entry.version;
  }

  /**
   * T319: remove an object "from the server" (another device), the
   * removal twin of `serverChange`. The entry's full version history
   * (every past version plus the current one) is kept in the bucket's
   * removed-objects map so `e:<id>.<version>` keeps answering afterwards;
   * the entry is deleted, the cv bumped, and a `{ o: '-' }` change is
   * logged and broadcast like `serverChange` does.
   */
  serverRemove(bucketName: string, id: string): void {
    const apps = this.storage.get('test-app');
    if (!apps) {
      throw new Error('serverRemove: unknown object ' + id);
    }
    const bucket = apps.get(bucketName);
    if (!bucket) {
      throw new Error('serverRemove: unknown object ' + id);
    }
    const entry = bucket.entries.get(id);
    if (!entry) {
      throw new Error('serverRemove: unknown object ' + id);
    }

    if (!bucket.removed) {
      bucket.removed = new Map();
    }
    bucket.removed.set(id, [...entry.history, { version: entry.version, data: { ...entry.data } }]);
    bucket.entries.delete(id);
    bucket.cv++;
    bucket.cvString = String(bucket.cv);

    // Find the channel number for this bucket
    let ch = 0;
    for (const [channel, name] of this.channelBuckets) {
      if (name === bucketName) {
        ch = channel;
        break;
      }
    }

    // Build and broadcast the removal
    const broadcast: BroadcastChange = {
      id,
      o: '-',
      ev: entry.version,
      cv: bucket.cvString,
      ccids: [randomUUID()],
      clientid: 'server',
    };

    bucket.log.push(broadcast);

    for (const conn of this.connections) {
      if (conn.ws && conn.ws.readyState === conn.ws.OPEN) {
        this.send(conn.ws, `${ch}:c:[${JSON.stringify(broadcast)}]`);
      }
    }
  }

}
