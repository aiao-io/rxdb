import { accessSync, mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createWaSqliteMiniProgramClient } from '../create-client.js';
import type { MiniProgramFileSystemManager, MiniProgramWechatApi } from '../mini-program.interface.js';
import { moduleFactory, wasmRuntime } from './subframe-wasm-factory.js';

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

/** 打开 `full` 后非空落盘抛抖音实测的配额错误；建空文件不占配额（**推断**）。 */
class QuotaToggleFileSystem extends NodeFileSystem {
  full = false;
  readonly quotaError = Object.assign(new Error('writeFileSync:fail user dir saved file size limit exceeded'), {
    name: 'API_ERROR',
    errNo: 21103,
    errorCode: 0
  });

  override writeFileSync(path: string, data: ArrayBuffer): void {
    if (this.full && data.byteLength > 0) throw this.quotaError;
    super.writeFileSync(path, data);
  }
}

function causeChain(error: unknown): unknown[] {
  const chain: unknown[] = [];
  for (let current = error; current instanceof Error; current = current.cause) chain.push(current);
  return chain;
}

function sqliteCodes(chain: readonly unknown[]): unknown[] {
  return chain.map(item => (item as { code?: unknown }).code).filter(code => typeof code === 'number');
}

function createUserDataRoot(): string {
  const userDataPath = mkdtempSync(join(tmpdir(), 'aiao-miniprogram-'));
  roots.push(userDataPath);
  return userDataPath;
}

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

  it('落盘撞配额：事务以 SQLITE_FULL 失败，错误链上带平台原文；恢复空间后可继续写', async () => {
    const userDataPath = createUserDataRoot();
    const fileSystem = new QuotaToggleFileSystem();
    const wechat: MiniProgramWechatApi = {
      env: { USER_DATA_PATH: userDataPath },
      getFileSystemManager: () => fileSystem
    };
    const client = await createWaSqliteMiniProgramClient('quota', {
      databaseRoot: join(userDataPath, 'database'),
      moduleFactory,
      wasmRuntime,
      wechat
    });
    await client.execute('CREATE TABLE todos (id INTEGER PRIMARY KEY, title TEXT NOT NULL);');

    fileSystem.full = true;
    const failure: unknown = await client.execute("INSERT INTO todos (title) VALUES ('lost');").catch(error => error);
    const chain = causeChain(failure);
    expect(sqliteCodes(chain)).toContain(13);
    expect(chain).toContain(fileSystem.quotaError);

    fileSystem.full = false;
    await client.execute("INSERT INTO todos (title) VALUES ('kept');");
    const rows = await client.execute('SELECT title FROM todos ORDER BY id;');
    expect(rows.results[0].rows).toEqual([['kept']]);
    await client.disconnect();
  });
});
