import { RxDB, SyncType } from '@aiao/rxdb';
import {
  accessSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  unlinkSync,
  writeFileSync
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type {
  MiniProgramFileSystemManager,
  MiniProgramWasmRuntime,
  MiniProgramWechatApi,
  WaSqliteMiniProgramOptions,
  WaSqliteModuleFactory
} from '../mini-program.interface.js';
import { ADAPTER_NAME } from '../mini-program.interface.js';
import { RxDBAdapterWaSqliteMiniProgram } from '../RxDBAdapterWaSqliteMiniProgram.js';

const require = createRequire(import.meta.url);
const moduleFactory = require('../../assets/wa-sqlite.cjs') as WaSqliteModuleFactory;
const wasmBytes = Uint8Array.from(readFileSync(new URL('../../assets/wa-sqlite.wasm', import.meta.url)));
const roots: string[] = [];

class NodeFileSystem implements MiniProgramFileSystemManager {
  accessSync(path: string): void {
    accessSync(path);
  }

  mkdirSync(path: string, recursive?: boolean): void {
    mkdirSync(path, { recursive });
  }

  readFileSync(path: string): string {
    return readFileSync(path, { encoding: 'base64' });
  }

  unlinkSync(path: string): void {
    unlinkSync(path);
  }

  writeFileSync(path: string, data: ArrayBuffer): void {
    writeFileSync(path, new Uint8Array(data));
  }
}

const wasmRuntime: MiniProgramWasmRuntime = {
  async instantiate(_path, imports) {
    const result = await WebAssembly.instantiate(wasmBytes, imports);
    return { instance: result.instance, module: result.module };
  }
};

/** 建一个已连上的小程序 adapter，并把它挂到 RxDB 上。 */
async function connectAdapter(dbName: string, options: WaSqliteMiniProgramOptions) {
  const rxdb = new RxDB({
    dbName,
    context: { userId: 'userId' },
    entities: [],
    sync: { local: { adapter: ADAPTER_NAME }, type: SyncType.None }
  });
  let adapter: RxDBAdapterWaSqliteMiniProgram | undefined;
  rxdb.adapter(ADAPTER_NAME, async db => {
    adapter = new RxDBAdapterWaSqliteMiniProgram(db, options);
    return adapter;
  });

  await rxdb.getAdapter(ADAPTER_NAME);
  await rxdb.connect(ADAPTER_NAME);
  if (!adapter) throw new Error('mini program adapter factory did not create an adapter');
  return { adapter, rxdb };
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { force: true, recursive: true });
});

describe('RxDBAdapterWaSqliteMiniProgram', () => {
  it('用 rxdb.config.dbName 建客户端，落到微信 VFS 的数据库目录并可跨连接复用', async () => {
    const userDataPath = mkdtempSync(join(tmpdir(), 'aiao-miniprogram-adapter-'));
    roots.push(userDataPath);
    const databaseRoot = join(userDataPath, 'database');
    const wechat: MiniProgramWechatApi = {
      env: { USER_DATA_PATH: userDataPath },
      getFileSystemManager: () => new NodeFileSystem()
    };
    const options: WaSqliteMiniProgramOptions = { databaseRoot, moduleFactory, wasmRuntime, wechat };

    const first = await connectAdapter('adapter-integration', options);
    expect(first.adapter.name).toBe(ADAPTER_NAME);
    expect(first.adapter.options).toBe(options);
    await first.adapter.writeQuery('CREATE TABLE probe (id INTEGER PRIMARY KEY, title TEXT NOT NULL);');
    await first.adapter.writeQuery('INSERT INTO probe (title) VALUES (?);', ['from-adapter']);
    await first.rxdb.disconnectAll();

    const databaseFiles = readdirSync(databaseRoot);
    expect(databaseFiles).toHaveLength(1);
    expect(databaseFiles[0]).toMatch(/^rxdb-adapter-integration.*\.sqlite$/);

    const second = await connectAdapter('adapter-integration', options);
    const rows = await second.adapter.query('SELECT title FROM probe ORDER BY id;');
    expect(rows.results[0].rows).toEqual([['from-adapter']]);
    await second.rxdb.disconnectAll();
  });
});
