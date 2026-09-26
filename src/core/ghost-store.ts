import { readFileSync, renameSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { secureMkdir, secureWriteFileSync } from './secure-fs';

// GhostStore interface matching vendor/simplenote/state/simperium/functions/in-memory-ghost.ts
interface Ghost<U> {
  key: string;
  version: number;
  data: U;
}

interface GhostStore<U> {
  getChangeVersion(): Promise<string>;
  setChangeVersion(version: string): Promise<void>;
  get(entityId: string): Promise<Ghost<U>>;
  put(entityId: string, version: number, data: U): Promise<Ghost<U>>;
  remove(entityId: string): Promise<Ghost<U>>;
  eachGhost(iterator: (ghost: Ghost<U>) => void): void;
}

interface GhostFileEntry {
  key: string;
  version: number;
  data: unknown;
}

interface GhostFile {
  version: number;
  cv: string;
  ghosts: GhostFileEntry[];
}

// burst of puts (first sync of a large account) coalesces
// into one file write; 100 ms window after the last write on disk.
const COALESCE_WINDOW_MS = 100;

export class FileGhostStore<U> implements GhostStore<U> {
  private readonly dir: string;
  private readonly filePath: string;
  private cv: string;
  private ghosts: Map<string, Ghost<U>>;
  // coalescing state.
  private lastWrite = 0;
  private timer: NodeJS.Timeout | null = null;
  private _dirExists = false; // OMARCHY: boundary cast

  constructor(dir: string, bucketName: string) {
    this.dir = dir;
    this.filePath = join(dir, `ghosts-${bucketName}.json`);
    this.cv = '';
    this.ghosts = new Map();
    this._dirExists = existsSync(this.filePath); // OMARCHY: boundary cast

    if (existsSync(this.filePath)) {
      try {
        const raw = readFileSync(this.filePath, 'utf8');
        const file: GhostFile = JSON.parse(raw);
        if (file.version !== 1) {
          return;
        }
        this.cv = file.cv ?? '';
        for (const entry of file.ghosts) {
          this.ghosts.set(entry.key, {
            key: entry.key,
            version: entry.version,
            data: entry.data as U,
          });
        }
      } catch {
        // Invalid JSON or other error — treat as empty
      }
    }
  }

  private persist(): void {
    // OMARCHY: boundary cast
    if (!existsSync(this.dir)) {
      if (this._dirExists) {
        // dir existed before but was wiped (e.g. logout); stay silent.
        return;
      }
      secureMkdir(this.dir);
      this._dirExists = true;
    }
    const file: GhostFile = {
      version: 1,
      cv: this.cv,
      ghosts: Array.from(this.ghosts.values()).map((g) => ({
        key: g.key,
        version: g.version,
        data: g.data,
      })),
    };
    const tmpPath = this.filePath + '.tmp';
    secureWriteFileSync(tmpPath, JSON.stringify(file));
    renameSync(tmpPath, this.filePath);
    this._dirExists = true;
  }

  // write everything now, cancelling any delayed write.
  private writeNow(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.persist();
    this.lastWrite = Date.now();
  }

  getChangeVersion(): Promise<string> {
    return Promise.resolve(this.cv);
  }

  setChangeVersion(version: string): Promise<void> {
    this.cv = version;
    // cv always writes at once: a ghost lost while the saved
    // change version is older is harmless, but a stale cv is not.
    this.writeNow();
    return Promise.resolve();
  }

  get(entityId: string): Promise<Ghost<U>> {
    const ghost = this.ghosts.get(entityId);
    if (ghost) {
      return Promise.resolve(ghost);
    }
    return Promise.resolve({ key: entityId, version: 0, data: {} as U });
  }

  put(entityId: string, version: number, data: U): Promise<Ghost<U>> {
    const ghost: Ghost<U> = { key: entityId, version, data };
    this.ghosts.set(entityId, ghost);
    // a lone put writes at once; puts within 100 ms of the
    // last write on disk share ONE delayed write (the sync library calls
    // put once per note while indexing).
    if (this.timer === null) {
      if (Date.now() - this.lastWrite >= COALESCE_WINDOW_MS) {
        this.writeNow();
      } else {
        this.timer = setTimeout(() => {
          this.timer = null;
          try {
            // a wiped data dir (logout) must never be
            // resurrected by a delayed write, and must never throw.
            if (existsSync(this.filePath)) {
              this.persist();
              this.lastWrite = Date.now();
            }
          } catch {
            // ignore: the dir is gone
          }
        }, COALESCE_WINDOW_MS);
        this.timer.unref();
      }
    }
    return Promise.resolve(ghost);
  }

  remove(entityId: string): Promise<Ghost<U>> {
    const ghost = this.ghosts.get(entityId);
    this.ghosts.delete(entityId);
    // removals are never delayed.
    this.writeNow();
    return Promise.resolve(ghost ?? { key: entityId, version: 0, data: {} as U });
  }

  eachGhost(iterator: (ghost: Ghost<U>) => void): void {
    this.ghosts.forEach((ghost) => iterator(ghost));
  }

  flush(): Promise<void> {
    // flush writes everything at once.
    this.writeNow();
    return Promise.resolve();
  }
}
