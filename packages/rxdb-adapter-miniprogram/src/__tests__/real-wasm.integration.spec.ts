import { accessSync, mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createWaSqliteMiniProgramClient } from '../create-client.js';
import type {
  MiniProgramFileSystemManager,
  MiniProgramWasmRuntime,
  MiniProgramWechatApi,
  WaSqliteModuleFactory
} from '../mini-program.interface.js';

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

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { force: true, recursive: true });
});

describe('真实 wa-sqlite WASM', () => {
  it('写入、关闭、重开后数据仍存在', async () => {
    const userDataPath = mkdtempSync(join(tmpdir(), 'aiao-miniprogram-'));
    roots.push(userDataPath);
    const databaseRoot = join(userDataPath, 'database');
    const wechat: MiniProgramWechatApi = {
      env: { USER_DATA_PATH: userDataPath },
      getFileSystemManager: () => new NodeFileSystem()
    };
    const options = { databaseRoot, moduleFactory, wasmRuntime, wechat };

    const first = await createWaSqliteMiniProgramClient('integration', options);
    await first.execute('CREATE TABLE todos (id INTEGER PRIMARY KEY, title TEXT NOT NULL);');
    await first.execute('INSERT INTO todos (title) VALUES (?);', ['first']);
    const before = await first.execute('SELECT title FROM todos ORDER BY id;');
    expect(before.results[0].rows).toEqual([['first']]);
    expect(await first.version()).toMatch(/^3\./);
    await first.disconnect();

    const second = await createWaSqliteMiniProgramClient('integration', options);
    const after = await second.execute('SELECT title FROM todos ORDER BY id;');
    expect(after.results[0].rows).toEqual([['first']]);
    const regexp = await second.execute("SELECT regexp('^fir', 'first');");
    expect(regexp.results[0].rows).toEqual([[1]]);
    await second.disconnect();
  });
});
