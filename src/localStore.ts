// IndexedDB-backed overlay for the static web app build, where there is no
// local dev server to write back to disk. Stores user-created/edited shaders,
// presets, models, textures, fonts, and tombstones for deleted bundled assets.

export type StoreKind = 'shaders' | 'presets' | 'models' | 'textures' | 'fonts';

export interface StoredEntry {
  key: string;
  kind: StoreKind;
  name: string;
  text?: string;
  blob?: Blob;
  deleted?: boolean;
}

const DB_NAME = 'gumpkestra-library';
const DB_VERSION = 1;
const STORE = 'entries';

export const entryKey = (kind: StoreKind, name: string) => `${kind}/${name}`;

function openDB(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'key' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function run<T>(db: IDBDatabase, mode: IDBTransactionMode, op: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = op(tx.objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'));
  });
}

export class LocalLibraryStore {
  private dbPromise: Promise<IDBDatabase | null> | null = null;
  /** In-memory fallback so edits still work during the session if IndexedDB is blocked. */
  private fallback = new Map<string, StoredEntry>();

  private db() {
    if (!this.dbPromise) this.dbPromise = openDB();
    return this.dbPromise;
  }

  async getAll(): Promise<StoredEntry[]> {
    const db = await this.db();
    if (!db) return [...this.fallback.values()];
    try {
      return await run(db, 'readonly', (s) => s.getAll() as IDBRequest<StoredEntry[]>);
    } catch {
      return [...this.fallback.values()];
    }
  }

  async get(kind: StoreKind, name: string): Promise<StoredEntry | undefined> {
    const key = entryKey(kind, name);
    const db = await this.db();
    if (!db) return this.fallback.get(key);
    try {
      return await run(db, 'readonly', (s) => s.get(key) as IDBRequest<StoredEntry | undefined>);
    } catch {
      return this.fallback.get(key);
    }
  }

  async put(entry: Omit<StoredEntry, 'key'>): Promise<void> {
    const full: StoredEntry = { ...entry, key: entryKey(entry.kind, entry.name) };
    this.fallback.set(full.key, full);
    const db = await this.db();
    if (!db) return;
    await run(db, 'readwrite', (s) => s.put(full));
  }

  async remove(kind: StoreKind, name: string): Promise<void> {
    const key = entryKey(kind, name);
    this.fallback.delete(key);
    const db = await this.db();
    if (!db) return;
    await run(db, 'readwrite', (s) => s.delete(key));
  }
}
