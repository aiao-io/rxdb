import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { isolationHeaders } from './artifact-server.mjs';

/** 产物根目录下的全部脚本（主包与各个 chunk；应用按需加载后，代码分散在多个文件里）。 */
export function scriptsOf(distRoot) {
  return readdirSync(distRoot)
    .filter(name => name.endsWith('.js'))
    .map(name => ({ name, source: readFileSync(join(distRoot, name), 'utf8') }));
}

/**
 * 桌面构建里 sqlite 工作线程脚本的文件名。从脚本里读它被引用的名字，不去猜带哈希的文件名。
 *
 * @param {string} distRoot web 的构建产物目录
 */
export function findSqliteWorker(distRoot) {
  const names = new Set(
    scriptsOf(distRoot).flatMap(({ source }) => {
      const match = /new Worker\(new URL\(`(worker-[\w-]+\.js)`/.exec(source);
      return match ? [match[1]] : [];
    })
  );
  if (names.size !== 1)
    throw new Error(
      `应该恰有一个 sqlite 工作线程的引用，找到：${[...names].join('、') || '没有'}（构建产物结构变了？）`
    );
  return [...names][0];
}

const SHELL_PATH = '/__sqlite-shell__';

/**
 * 在页面里启动桌面自己的 sqlite 工作线程，经 Comlink 的线协议对桌面库直接执行 SQL（ADESK-US-008 的数据库夹具）。
 * 升级验收（ADESK-US-106）靠它造「旧库」（删掉版本记录）、「缺表的库」（删表）、「被更新版本升级过的库」（改版本记录），
 * 以及在另一个标签页打开着桌面时从旁边改库——这些状态没法经桌面界面造出来。
 *
 * 库在 OPFS 里（OPFSCoopSyncVFS，允许多条连接协作）。页面是桌面来源下一个只含空白文档的页面，
 * 所以与桌面共用同一份 OPFS。用完 `close()`，否则工作线程一直占着库。
 *
 * @param {import('playwright').BrowserContext} context 桌面所在的（通常是持久的）上下文
 * @param {{ origin: string, distRoot: string }} options 桌面的来源与构建产物目录
 */
export async function openSqliteShell(context, { origin, distRoot }) {
  const workerFile = findSqliteWorker(distRoot);
  const page = await context.newPage();
  await page.route(`${origin}${SHELL_PATH}`, route =>
    route.fulfill({
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8', ...isolationHeaders },
      body: '<!doctype html><title>sqlite shell</title>'
    })
  );
  await page.goto(`${origin}${SHELL_PATH}`);
  await page.evaluate(async file => {
    const root = await navigator.storage.getDirectory();
    let dbName;
    for await (const [name] of root.entries()) {
      if (/^aiao-desktop@.*\.sqlite$/.test(name)) dbName = name.slice(0, -'.sqlite'.length);
    }
    if (!dbName) throw new Error('OPFS 里没有桌面的库文件');
    const worker = new Worker(`/${file}`, { type: 'module' });
    const pending = new Map();
    let sequence = 0;
    worker.addEventListener('message', event => {
      const { id, type, name, value } = event.data ?? {};
      const waiting = pending.get(id);
      if (!waiting) return;
      pending.delete(id);
      if (type === 'HANDLER' && name === 'throw') waiting.reject(new Error(value?.value?.message ?? '工作线程报错'));
      else waiting.resolve(value);
    });
    /* Comlink 的线协议：APPLY 一个方法，参数与结果都是 RAW 值。 */
    const call = (path, args) =>
      new Promise((resolve, reject) => {
        const id = `shell-${++sequence}`;
        pending.set(id, { resolve, reject });
        worker.postMessage({ id, type: 'APPLY', path, argumentList: args.map(value => ({ type: 'RAW', value })) });
      });
    await call(
      ['init'],
      [
        dbName,
        { vfs: 'opfs', wasmUrl: `${location.origin}/sqlite-wasm/wa-sqlite.wasm`, worker: true, sharedWorker: false }
      ]
    );
    window.__sqliteShell = {
      execute: (sql, bindings) => call(['execute'], [sql, bindings ?? []]),
      close: async () => {
        await call(['disconnect'], []);
        worker.terminate();
      }
    };
  }, workerFile);
  const execute = (sql, bindings) =>
    page.evaluate(([statement, values]) => window.__sqliteShell.execute(statement, values), [sql, bindings ?? []]);
  return {
    /** 执行一条 SQL，返回适配器的结果对象。 */
    execute,
    /** 执行一条查询，返回所有结果行（数组的数组）。 */
    async rows(sql, bindings) {
      const result = await execute(sql, bindings);
      return result.results.flatMap(item => item.rows);
    },
    /** 断开库、结束工作线程、关掉页面。 */
    async close() {
      await page.evaluate(() => window.__sqliteShell.close());
      await page.close();
    }
  };
}
