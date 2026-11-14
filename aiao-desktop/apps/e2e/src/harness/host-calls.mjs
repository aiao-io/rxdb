import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { surgery } from './database.mjs';
import { orbitDist, standinProbe } from './standin.mjs';

/**
 * Orbit 的协议常量（`DESKTOP_LIMITS`）：从 Orbit 的构建产物读，不抄一份数字——e2e 不 import web 的源码（D-02），
 * Orbit 是独立发布的包，读它的 dist 不违反这条。
 */
export async function desktopLimits() {
  const { DESKTOP_LIMITS } = await import(pathToFileURL(join(orbitDist, 'desktop.js')).href);
  return DESKTOP_LIMITS;
}

/**
 * 逐项记录检查项的结果：设了环境变量 `E2E_TRACE` 时，每个检查项一出结果就打到 stderr（调试时不用等整组跑完才知道哪一项没过）；
 * 没设时就是个普通对象，不影响冒烟的输出。
 *
 * @template {Record<string, unknown>} T
 * @param {string} group
 * @param {T} [target]
 * @returns {T}
 */
export function traced(group, target = /** @type {T} */ ({})) {
  if (!process.env.E2E_TRACE) return target;
  return new Proxy(target, {
    set(object, key, value) {
      console.error(`  [${group}] ${String(key)} = ${JSON.stringify(value)}`);
      return Reflect.set(object, key, value);
    }
  });
}

/** 轮询到 `probe` 给出真值为止；超时返回 `undefined`（由检查项自己判定失败）。 */
export async function until(page, probe, timeout = 10_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const value = await probe().catch(() => undefined);
    if (value) return value;
    await page.waitForTimeout(100);
  }
  return undefined;
}

/**
 * 替身应用（Aiao Code）的调用入口（ADESK-US-206 阶段 D）：
 *
 * - `call(路径, 参数)`：经统一的能力接口调用并等结果（成功值或稳定错误码）；
 * - `start(编号, 路径, 参数)`：发起调用但不等（用户还在桌面面板里操作时调用不会返回），
 *   `outcome(编号)` 等它的结果——结果由替身转告桌面页（窗口关闭、iframe 销毁之后也看得到）；
 * - 文件内容用 `text`（保存）与 `text`、`bytesLength`（打开的结果）传，见 `standin.mjs`。
 *
 * @param {{ page: import('playwright').Page }} session
 */
export function standinCalls(session) {
  const { page } = session;
  const probe = standinProbe(page);
  let sequence = 0;
  const call = async (path, args = null) =>
    (await probe.frame()).evaluate(([name, value]) => window.standin.call(name, value), [path, args]);
  const start = async (id, path, args = null) => {
    await (
      await probe.frame()
    ).evaluate(([key, name, value]) => window.standin.start(key, name, value), [id, path, args]);
    return id;
  };
  /** 发起一次调用，返回它的编号（`start` 的便捷写法）。 */
  const begin = (path, args = null) => start(`call-${++sequence}`, path, args);
  const outcome = (id, timeout = 10_000) =>
    until(page, () => page.evaluate(key => window.__standinResults?.[key], id), timeout);
  /** 迟到的调用：对一个已分离的旧 frame 求值，浏览器里它没有执行上下文，消息物理上发不出去。 */
  const lateCall = (frame, action, arg) =>
    frame.evaluate(action, arg).then(
      () => 'delivered',
      () => 'undeliverable'
    );
  return { ...probe, call, start, begin, outcome, lateCall };
}

/**
 * 桌面的打开 / 保存面板在页面上的位置（ADESK-US-206 阶段 D）。选择器是面板的 `data-fp-*` 钩子，不读 web 的源码。
 *
 * @param {import('playwright').Page} page
 */
export function filePanel(page) {
  const panel = page.locator('[data-file-panel]');
  return {
    panel,
    scrim: page.locator('[data-file-panel-scrim]'),
    rows: panel.locator('[data-fp-entry]'),
    row: name => panel.locator(`[data-fp-entry][data-name="${name}"]`),
    list: panel.locator('[data-fp-list]'),
    name: panel.locator('[data-fp-name]'),
    up: panel.locator('[data-fp-up]'),
    where: panel.locator('[data-fp-path]'),
    cancel: panel.locator('[data-fp-cancel]'),
    confirm: panel.locator('[data-fp-confirm]'),
    replace: panel.locator('[data-fp-replace]'),
    problem: panel.locator('[data-fp-problem]'),
    filter: panel.locator('[data-fp-filter]'),
    /** 面板里现在的条目名（按显示顺序）。 */
    names: () =>
      panel.locator('[data-fp-entry]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-name'))),
    /** 面板所在的位置（路径文字）。 */
    location: async () => ((await panel.locator('[data-fp-path]').textContent()) ?? '').trim(),
    /** 面板里拿着键盘焦点的元素（`null` 表示焦点在面板外）。 */
    focused: () =>
      page.evaluate(() => {
        const active = document.activeElement;
        const inside = active?.closest('[data-file-panel]');
        if (!inside) return null;
        return (
          active.matches('[data-fp-list]') ? 'list'
          : active.matches('[data-fp-name]') ? 'name'
          : active.matches('[data-fp-cancel]') ? 'cancel'
          : active.matches('[data-fp-confirm]') ? 'confirm'
          : active.matches('[data-fp-up]') ? 'up'
          : active.tagName.toLowerCase()
        );
      }),
    /** 面板里当前选中的条目名（`aria-activedescendant` 指向的那一行）。 */
    active: () =>
      page.evaluate(() => {
        const list = document.querySelector('[data-fp-list]');
        const id = list?.getAttribute('aria-activedescendant');
        return id ? (document.getElementById(id)?.getAttribute('data-name') ?? null) : null;
      })
  };
}

/** 磁盘上一个文件在库里的行（名字在测试里唯一）：大小、修改时间、父目录名、内容在 OPFS 的路径；没有这一行是 `undefined`。 */
export async function diskRow(session, name) {
  const rows = await surgery(session, db =>
    db.shell.rows(
      `SELECT f.size, f.modified_at, p.name, m.opfs_path
         FROM "desktop$desktop_file" f
         LEFT JOIN "desktop$desktop_file" p ON p.id = f."parentId"
         LEFT JOIN "storage$storage_file_meta" m ON m.id = f.content_id
        WHERE f.name = ?`,
      [name]
    )
  );
  const [row] = rows;
  return row && { size: row[0], modified: row[1], folder: row[2], blob: row[3], count: rows.length };
}

/** 库里名字是 `name` 的行数（删除与改名之后「原路径没有新建」的证据）。 */
export const diskCount = async (session, name) =>
  Number(
    (
      await surgery(session, db => db.shell.rows(`SELECT count(*) FROM "desktop$desktop_file" WHERE name = ?`, [name]))
    )[0][0]
  );

/** 读一个文件的内容（经页面里的 OPFS，库里只存元数据）；文件不在是 `undefined`。 */
export async function diskText(session, name) {
  const row = await diskRow(session, name);
  if (!row?.blob) return undefined;
  return session.page.evaluate(async path => {
    const root = await navigator.storage.getDirectory();
    const dir = await (await root.getDirectoryHandle('aiao-desktop-files')).getDirectoryHandle('blobs');
    return (await (await dir.getFileHandle(path.replace(/^blobs\//, ''))).getFile()).text();
  }, row.blob);
}
