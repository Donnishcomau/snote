# Simperium wire protocol as spoken by `simperium@1.1.4` (node-simperium)

Verified against `node_modules/simperium/lib/simperium/{client,channel,server}.js` and `util/*.js` on 2026-09-18.
The package's own reference server is `node_modules/simperium/lib/simperium/server.js` (151 lines): start from it.

## Framing
- WebSocket URL: `wss://api.simperium.com/sock/1/<app_id>/websocket` (override with `options.url`).
- Heartbeat: client sends `h:<n>`; server replies `h:<n+1>`.
- Every other message is `<channel>:<command>:<payload>`. The channel is an integer the client assigns per bucket, starting at 0.
  `parseMessage` splits at the FIRST colon only, so a server must split the channel first, then parse `command:payload`.

## Handshake
- client → `0:init:{"name":"note","clientid":"<session>","api":"1.1","token":"<token>","app_id":"<app>","library":"node-simperium","version":"0.0.1"}`
- server → `0:auth:<email>` on success (plain string), or `0:auth:{"code":401,"msg":"..."}` on failure (client emits `unauthorized`).

## Index (first sync)
- client → `0:i:1:<mark>::10` (mark empty on the first request; 10 = page size)
- server → `0:i:{"index":[{"id":"<id>","v":<version>,"d":{...data...}}],"current":"<cv>","mark":"<next mark>"}`; omit `mark` on the last page.

## Change version (resume)
- client → `0:cv:<cv>`; server → `0:c:[...changes since cv...]` (may be `[]`), or `0:cv:?` when unknown (client re-indexes).

## Entity by version
- client → `0:e:<id>.<version>`; server → `0:e:<id>.<version>\n{"data":{...}}` or `0:e:<id>.<version>\n?` if missing.

## Local change (client → server)
- `0:c:{"o":"M","id":"<id>","ccid":"<uuid>","v":{<jsondiff patch>},"sv":<source version, absent for new>}` or `{"o":"-","id":"<id>","ccid":"<uuid>"}`.
- Patches use the package's jsondiff (`node_modules/simperium/lib/simperium/jsondiff`): `object_diff(a,b)` and `apply_object_diff(a,patch)`.

## Server broadcast (server → every client on the bucket, including the sender)
- `0:c:[{"id":"<id>","o":"M","v":{<patch>},"sv":<old version>,"ev":<new version>,"cv":"<new cv>","ccids":["<ccid>"],"clientid":"<sender>"}]`
- Removal: `{"id","o":"-","cv","ccids","clientid"}`. The sender acknowledges its own change by matching `ccids`.
- Errors: `{"id":"<id>","ccids":["<ccid>"],"error":409}` (duplicate ccid), 412 (patch made no change), 440 (patch cannot apply).

## Client API (what tests and app code may call)
- `import createClient from 'simperium'`; `createClient(appId, token, { url, objectStoreProvider, ghostStoreProvider })` connects immediately; `client.end()` stops and disables reconnect. There is no `start()`.
- `const b = client.bucket('note')`: `b.get(id)`, `b.update(id, data)`, `b.remove(id)`, `b.find()`, `b.hasLocalChanges()`, `b.getVersion(id)`, `b.getRevisions(id)`.
- Events: `b.on('index')`, `b.on('ready')`, `b.channel.on('update', (id, data, original, patch, isIndexing))`, `b.channel.on('remove', id)`, `client.on('unauthorized')`.
- In-memory stores for tests: `InMemoryBucket`, `InMemoryGhost` in `vendor/simplenote/state/simperium/functions/`.

## Transport facts (verified 2026-09-19 against node_modules/websocket 1.0.31 and simperium client.js)
- In Node the client's default transport is the `websocket` package's `w3cwebsocket`. It is a W3C-style socket built on `yaeti` EventTarget: assigning `socket.onmessage = fn` WORKS, and each server text frame arrives as an event whose `.data` is the frame string. `client.js` reads `event.data` in `parseMessage`.
- Therefore: do NOT wrap, patch, or replace the transport, and do not pass a custom `websocketClientProvider` to fix "the client receives nothing". If the client never sees `auth`, the fault is in the server's framing: the reply must be `<channel>:auth:<email>` on the same channel number the client used in `<channel>:init:...`, sent as a text frame, after the server has parsed the channel by splitting on the FIRST colon only.
- Quick server-side self-check before running the vitest suite: connect with the `ws` client, send `0:init:{"name":"note","clientid":"t","api":"1.1","token":"good","app_id":"app","library":"node-simperium","version":"0.0.1"}` and assert the first frame received is exactly `0:auth:user@example.com`.

## Outbound timing in the vendored middleware (verified 2026-09-19)
- Local note edits are debounced: `queueNoteUpdate(noteId, delay = 2000)`; tag and preference updates use 20 ms; trash, restore and delete-forever use 10 ms. `BucketQueue` sends when the deadline passes and the bucket is not indexing.
- Tests must not wait out the 2 s debounce under the 3 s global timeout: make the note-edit delay injectable through the store's sync options and use 10 ms in tests.
- `BucketQueue` and the connection monitor call `window.addEventListener('online' | 'offline')`. Outside vitest there is no `window`; `src/core` must define a minimal `globalThis.window` shim before the middleware is constructed.
