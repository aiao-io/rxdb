import { existsSync, mkdirSync, readdirSync, statfsSync, statSync } from 'node:fs';
import { open, readFile, rename, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { uuid } from './product-http.ts';
import { missingRelayTask, RelayTask, relayTaskLimits } from './relay-task.ts';
import type { RelayResultStore, RelayTaskContext, RelayTaskNamespace, WorkerRequest, WorkerSql } from './worker-env.ts';

const missing = (error: unknown) => error instanceof Error && 'code' in error && error.code === 'ENOENT';
const identifier = (key: string) => {
  if (!uuid(key)) throw new Error('Invalid relay task identifier');
  return key;
};

/** 文件结果只存密文，完整落盘后才公布最终文件名。 */
class FileResults implements RelayResultStore {
  private readonly directory: string;
  constructor(directory: string) {
    this.directory = directory;
  }
  path(key: string) {
    return join(this.directory, `${identifier(key)}.bin`);
  }
  async put(key: string, value: Uint8Array<ArrayBuffer>) {
    const temporary = `${this.path(key)}.${crypto.randomUUID()}.pending`;
    try {
      const handle = await open(temporary, 'wx', 0o600);
      try {
        await handle.writeFile(value);
        await handle.sync();
      } finally {
        await handle.close();
      }
      await rename(temporary, this.path(key));
      const parent = await open(this.directory, 'r');
      try {
        await parent.sync();
      } finally {
        await parent.close();
      }
    } finally {
      await rm(temporary, { force: true });
    }
  }
  async get(key: string) {
    try {
      return { body: new Response(await readFile(this.path(key))).body! };
    } catch (error) {
      if (missing(error)) return null;
      throw error;
    }
  }
  async head(key: string) {
    try {
      return { size: (await stat(this.path(key))).size };
    } catch (error) {
      if (missing(error)) return null;
      throw error;
    }
  }
  async delete(key: string) {
    await rm(this.path(key), { force: true });
  }
}

type Entry = { db: DatabaseSync; task: RelayTask; timer?: NodeJS.Timeout; deleted: boolean };
interface RuntimeOptions {
  directory: string;
  request?: WorkerRequest;
  maxConcurrent?: number;
  maxResultBytes?: number;
}

/** 单进程生产适配：独占运行目录、持久任务和闹钟，复用既有任务状态机。 */
export class NodeRelayRuntime implements RelayTaskNamespace {
  private readonly options: RuntimeOptions;
  private readonly entries = new Map<string, Entry>();
  private readonly pending = new Set<Promise<unknown>>();
  private readonly results: FileResults;
  private lease?: DatabaseSync;
  private reservations = 0;
  private closing = false;
  constructor(options: RuntimeOptions) {
    this.options = options;
    this.results = new FileResults(join(options.directory, 'results'));
  }
  async start() {
    mkdirSync(join(this.options.directory, 'tasks'), { recursive: true, mode: 0o700 });
    mkdirSync(join(this.options.directory, 'results'), { recursive: true, mode: 0o700 });
    this.lease = new DatabaseSync(join(this.options.directory, 'runtime.sqlite'));
    this.lease.exec('BEGIN EXCLUSIVE');
    for (const name of readdirSync(join(this.options.directory, 'results')))
      if (name.endsWith('.pending')) await rm(join(this.options.directory, 'results', name));
    for (const name of readdirSync(join(this.options.directory, 'tasks'))) {
      if (!name.endsWith('.sqlite')) continue;
      const id = identifier(name.slice(0, -7));
      const entry = this.activate(id);
      const row = entry.db.prepare('SELECT at FROM relay_alarm WHERE id=1').get();
      if (row && Number(row.at) <= Date.now()) await this.alarm(id);
      else if (row) this.schedule(id, Number(row.at));
      else await entry.task.ensureWatchdog();
    }
  }
  bindings(): { RELAY_TASKS: RelayTaskNamespace; RELAY_RESULTS: RelayResultStore } {
    return { RELAY_TASKS: this, RELAY_RESULTS: this.results };
  }
  idFromName(name: string) {
    return `relay-task:${identifier(name.replace(/^relay-task:/, ''))}`;
  }
  get(id: { toString(): string }) {
    const key = identifier(id.toString().replace(/^relay-task:/, ''));
    return { fetch: (input: RequestInfo | URL, init?: RequestInit) => this.fetch(key, new Request(input, init)) };
  }
  async fetch(id: string, request: Request) {
    const known = this.entries.has(id) || existsSync(this.databasePath(id));
    const creating = request.method === 'PUT' && !known;
    if (!known && request.method !== 'PUT') return missingRelayTask();
    if (creating && !this.hasCapacity())
      return Response.json(
        { error: 'Relay capacity reached' },
        { status: 429, headers: { 'cache-control': 'no-store' } }
      );
    if (creating) this.reservations++;
    try {
      return await this.activate(id).task.fetch(request);
    } finally {
      if (creating) this.reservations--;
    }
  }
  async settled() {
    while (this.pending.size) await Promise.allSettled([...this.pending]);
  }
  async close() {
    this.closing = true;
    await this.settled();
    for (const entry of this.entries.values()) {
      clearTimeout(entry.timer);
      entry.db.close();
    }
    this.entries.clear();
    this.lease?.close();
    this.lease = undefined;
  }
  private databasePath(id: string) {
    return join(this.options.directory, 'tasks', `${identifier(id)}.sqlite`);
  }
  private hasCapacity() {
    const concurrent = this.pending.size + this.reservations;
    if (this.closing || concurrent >= (this.options.maxConcurrent ?? 2)) return false;
    const directory = join(this.options.directory, 'results');
    const stored = readdirSync(directory).reduce((total, name) => total + statSync(join(directory, name)).size, 0);
    const reserved = (concurrent + 1) * (relayTaskLimits.resultBytes + 64);
    const disk = statfsSync(directory);
    return (
      stored + reserved <= (this.options.maxResultBytes ?? 512 * 1024 * 1024) &&
      disk.bavail * disk.bsize - reserved >= 512 * 1024 * 1024
    );
  }
  private activate(id: string): Entry {
    const existing = this.entries.get(id);
    if (existing) return existing;
    const db = new DatabaseSync(this.databasePath(id));
    db.exec('PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS relay_alarm (id INTEGER PRIMARY KEY, at INTEGER)');
    const entry = { db, deleted: false } as Entry;
    const sql: WorkerSql = {
      exec: <Row extends Record<string, SqlStorageValue>>(query: string, ...values: SqlStorageValue[]) => {
        if (entry.deleted) throw new Error('Task storage was deleted');
        const statement = db.prepare(query);
        const bindings = values.map(value => (value instanceof ArrayBuffer ? new Uint8Array(value) : value));
        return statement.all(...bindings) as unknown as Row[];
      }
    };
    const context: RelayTaskContext = {
      storage: {
        sql,
        setAlarm: async time => {
          const at = Number(time);
          db.prepare('INSERT INTO relay_alarm VALUES (1,?) ON CONFLICT(id) DO UPDATE SET at=excluded.at').run(at);
          this.schedule(id, at);
        },
        getAlarm: async () => {
          const row = db.prepare('SELECT at FROM relay_alarm WHERE id=1').get() as { at?: number } | undefined;
          return row?.at === undefined ? null : Number(row.at);
        },
        deleteAlarm: async () => {
          clearTimeout(entry.timer);
          db.exec('DELETE FROM relay_alarm');
        },
        deleteAll: async () => {
          db.exec('DROP TABLE IF EXISTS relay_task; DELETE FROM relay_alarm');
          entry.deleted = true;
        }
      },
      waitUntil: operation => {
        const pending = operation.catch(() => {
          console.error('Relay background operation failed');
        });
        this.pending.add(pending);
        void pending.finally(() => this.pending.delete(pending));
      }
    };
    entry.task = new RelayTask(context, { RELAY_RESULTS: this.results }, this.options.request);
    this.entries.set(id, entry);
    return entry;
  }
  private schedule(id: string, at: number) {
    const entry = this.entries.get(id)!;
    clearTimeout(entry.timer);
    entry.timer = setTimeout(
      () => {
        const pending = this.alarm(id).catch(() => {
          console.error('Relay expiry operation failed');
        });
        this.pending.add(pending);
        void pending.finally(() => this.pending.delete(pending));
      },
      Math.max(0, at - Date.now())
    );
    entry.timer.unref();
  }
  private async alarm(id: string) {
    const entry = this.activate(id);
    await entry.task.alarm();
    if (!entry.deleted) return;
    clearTimeout(entry.timer);
    entry.db.close();
    this.entries.delete(id);
    await rm(this.databasePath(id), { force: true });
  }
}
