import { accessSync, mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createWaSqliteMiniProgramClient } from '../create-client.js';
import type {
  MiniProgramFileSystemManager,
  MiniProgramWechatApi
} from '../mini-program.interface.js';
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

function createOptions() {
  const userDataPath = mkdtempSync(join(tmpdir(), 'aiao-miniprogram-fts5-'));
  roots.push(userDataPath);
  const wechat: MiniProgramWechatApi = {
    env: { USER_DATA_PATH: userDataPath },
    getFileSystemManager: () => new NodeFileSystem()
  };
  return { databaseRoot: join(userDataPath, 'database'), moduleFactory, wasmRuntime, wechat };
}

/** 与 `@aiao/rxdb-plugin-search` 的 `buildCreateFtsTableSql` 同形的外部内容虚拟表。 */
const CREATE_SOURCE_SQL = 'CREATE TABLE notes (id INTEGER PRIMARY KEY, title TEXT NOT NULL);';
const CREATE_FTS_SQL = `
  CREATE VIRTUAL TABLE _fts_notes USING fts5(
    "title",
    content='notes',
    content_rowid='rowid',
    tokenize='unicode61 remove_diacritics 2'
  );
`;
/** 索引侧必须过 `rxdb_fts_bigram`，否则中文整段只切成一个 token，中缀查询零召回。 */
const BACKFILL_SQL =
  'INSERT INTO _fts_notes(rowid, "title") SELECT src.rowid, rxdb_fts_bigram(src."title") FROM notes AS src;';

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { force: true, recursive: true });
});

describe('小程序 wa-sqlite 构建的 FTS5 能力', () => {
  it('编入了 FTS5 模块并注册了 rxdb_fts_bigram', async () => {
    const client = await createWaSqliteMiniProgramClient('fts5-capability', createOptions());

    // 列名不能与表名同名：FTS5 声明 vtab 时会额外加一列与表同名，撞名就是重复列，
    // 而 FTS5 不写 `*pzErr`，只会报不透明的 `vtable constructor failed: <table>`。
    await client.execute('CREATE VIRTUAL TABLE temp.probe USING fts5(body);');
    await client.execute('DROP TABLE temp.probe;');

    const bigram = await client.execute("SELECT rxdb_fts_bigram('全文搜索');");
    expect(bigram.results[0].rows).toEqual([['全 文 搜 索 全文 文搜 搜索']]);

    await client.disconnect();
  });

  it('中英文 MATCH 均可命中，断开重开后索引仍在', async () => {
    const options = createOptions();
    const first = await createWaSqliteMiniProgramClient('fts5-match', options);

    await first.execute(CREATE_SOURCE_SQL);
    await first.execute(CREATE_FTS_SQL);
    await first.execute('INSERT INTO notes (title) VALUES (?), (?);', ['rxdb 全文搜索设计', 'wa-sqlite 适配器']);
    await first.execute(BACKFILL_SQL);

    // 查询侧切法取自 `compileCjkToken('全文搜索')`，与索引侧同源
    const cjk = await first.execute(
      `SELECT "title" FROM _fts_notes WHERE _fts_notes MATCH '"全文" AND "文搜" AND "搜索"';`
    );
    expect(cjk.results[0].rows).toHaveLength(1);

    const latin = await first.execute(`SELECT rowid FROM _fts_notes WHERE _fts_notes MATCH '"rxdb"';`);
    expect(latin.results[0].rows).toEqual([[1]]);

    await first.disconnect();

    const second = await createWaSqliteMiniProgramClient('fts5-match', options);
    const reopened = await second.execute(
      `SELECT rowid FROM _fts_notes WHERE _fts_notes MATCH '"全文" AND "文搜" AND "搜索"';`
    );
    expect(reopened.results[0].rows).toEqual([[1]]);

    await second.disconnect();
  });
});
