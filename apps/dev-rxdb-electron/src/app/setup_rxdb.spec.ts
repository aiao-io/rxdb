import {
  DESKTOP_HOST_TRANSPORT_KEY,
  ELECTRON_ADAPTER_NAME as PACKAGE_ELECTRON_ADAPTER_NAME
} from '@aiao/rxdb-adapter-electron';
import { ELECTRON_PGLITE_ADAPTER_NAME as PACKAGE_ELECTRON_PGLITE_ADAPTER_NAME } from '@aiao/rxdb-adapter-electron/pglite';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DESKTOP_DEMO_DB_NAME, DESKTOP_PGLITE_DB_NAME, WEB_PREVIEW_DB_NAME } from './db-names';
import { RxDBLocalBackendTableError, selectLocalBackend } from './local-backend';
import {
  ELECTRON_ADAPTER_NAME,
  ELECTRON_PGLITE_ADAPTER_NAME,
  localBackends,
  WA_SQLITE_ADAPTER_NAME
} from './setup_rxdb';

/** 读同目录下的源文件；下面几条静态门禁都靠它。 */
const read = (file: string): string => readFileSync(resolve(import.meta.dirname, file), 'utf8');

/**
 * 去掉 TS 注释后再断言。
 *
 * @remarks
 * 下面几条门禁挡的都是某个具体写法，而源码里**解释为什么不这么写**的那句 TSDoc
 * 恰好逐字包含它 —— 「本模块不调用 `inject()`」「`inject(RxDB)` 会撞上尚未就绪」
 * 「而不是 import 适配器包」。不剥注释的话，写得越清楚红得越快。
 *
 * 只剥不含引号的行注释：`'https://…'` 这类字符串里的 `//` 不该被当成注释切掉。
 * 本仓的源码里没有「字符串里带 `//` 且同行还有真注释」的写法，这个近似足够了。
 */
const stripTsComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[^'"`\n]*?\/\/.*$/gm, '');

describe('localBackends', () => {
  it('picks the main-process SQLite file inside an Electron window', () => {
    const backend = selectLocalBackend(localBackends({ [DESKTOP_HOST_TRANSPORT_KEY]: {} }));
    expect(backend.adapter).toBe(ELECTRON_ADAPTER_NAME);
    expect(backend.dbName).toBe(DESKTOP_DEMO_DB_NAME);
  });

  it('falls back to wa-sqlite in a plain browser preview', () => {
    const backend = selectLocalBackend(localBackends({}));
    expect(backend.adapter).toBe(WA_SQLITE_ADAPTER_NAME);
    expect(backend.dbName).toBe(WEB_PREVIEW_DB_NAME);
  });

  it('picks the PGlite desktop backend when the entry URL requests it', () => {
    const backend = selectLocalBackend(
      localBackends({ [DESKTOP_HOST_TRANSPORT_KEY]: {}, location: { search: '?pglite=1' } })
    );
    expect(backend.adapter).toBe(ELECTRON_PGLITE_ADAPTER_NAME);
    expect(backend.dbName).toBe(DESKTOP_PGLITE_DB_NAME);
  });

  it('ignores the pglite flag without the desktop bridge', () => {
    const backend = selectLocalBackend(localBackends({ location: { search: '?pglite=1' } }));
    expect(backend.adapter).toBe(WA_SQLITE_ADAPTER_NAME);
  });

  /**
   * 适配器名与库名必须来自**同一条**候选。分开算的话，
   * `provideRxDB` 建的是 desktop 库而 `LocalDatabaseService` 去连 wa-sqlite，
   * 症状是「连接一个不存在的适配器」——错误信息指不到真正的原因。
   *
   * US-207 E11 之后 `create` 是个当场新建的箭头函数（里面裹着动态 `import()`），
   * 不再能拿工厂的**引用相等**来表达这件事；`dbName` 是同一条候选上唯一另一个
   * 可观察字段，绑的是同一件事。
   */
  it('keeps the adapter name and the dbName in the same branch', () => {
    for (const runtime of [{ [DESKTOP_HOST_TRANSPORT_KEY]: {} }, {}, null, undefined]) {
      const backend = selectLocalBackend(localBackends(runtime));
      const expected = backend.adapter === ELECTRON_ADAPTER_NAME ? DESKTOP_DEMO_DB_NAME : WEB_PREVIEW_DB_NAME;
      expect(backend.dbName).toBe(expected);
    }
  });

  /**
   * US-207 E9：两个后端写的是两份永不互通的数据（主进程的原生文件 vs 渲染进程的 OPFS）。
   * 同名意味着「当前连的是哪个库」没有答案，所以这条由 `selectLocalBackend` 的表校验兜住 ——
   * 这个用例守的是本 demo 真的没有踩上去。
   */
  it('gives each backend its own dbName', () => {
    const dbNames = localBackends({}).map(({ dbName }) => dbName);

    expect(new Set(dbNames).size).toBe(dbNames.length);
    expect(() => selectLocalBackend(localBackends({}))).not.toThrow(RxDBLocalBackendTableError);
  });
});

/**
 * US-207 E11：只有被选中的那个后端才应该被下载、求值。
 *
 * @remarks
 * 这几条是**静态**门禁：真正的证据在打包产物里（见 `scripts/audit/`），但那要先打包才验得到，
 * 而把静态 import 写回去只需要一次「顺手补个常量」。门禁先红，产物审计兜底。
 *
 * 与 `apps/dev-rxdb-tauri/src/app/setup_rxdb.spec.ts` 同构 —— 两个桌面 demo 的这段结构
 * 是同一份，判据也该是同一份。
 */
describe('本地后端按需加载', () => {
  it('两个后端各自走动态 import 加载', () => {
    const source = read('setup_rxdb.ts');
    expect(source).toMatch(/await import\('\.\/setup_rxdb_desktop'\)/);
    expect(source).toMatch(/await import\('\.\/setup_rxdb_wa-sqlite'\)/);
    // 静态 import 会把整个模块（连同它的适配器）拉回主 chunk，动态 import 也就白做了。
    expect(source).not.toMatch(/^import .*setup_rxdb_(desktop|wa-sqlite)/m);
  });

  /**
   * `setup_rxdb.ts` 里的 `'sqlite-electron'` 是**抄**的字面量，不是从
   * `@aiao/rxdb-adapter-electron` import 来的常量：本模块在主 chunk 里（候选表要在建库之前
   * 就报出后端身份），而那句 import 会把适配器包的 barrel 一起拽进主 chunk ——
   * barrel 转出的 `DesktopSqliteClient` 于是跟着进了 `main.js`，正是 E11 与 US-505 AC#10
   * 要挡的「桌面传输客户端代码进浏览器 bundle」。
   *
   * 抄的代价在这一条里还清：单测走源码、不进产物，所以这个 import 不花 bundle 的钱，
   * 而包里改了名字会在这里当场变红，不会拖到运行时变成「连接一个不存在的适配器」。
   */
  it('适配器名与包里的常量一致，且不靠 import 保证', () => {
    expect(ELECTRON_ADAPTER_NAME).toBe(PACKAGE_ELECTRON_ADAPTER_NAME);
    expect(ELECTRON_PGLITE_ADAPTER_NAME).toBe(PACKAGE_ELECTRON_PGLITE_ADAPTER_NAME);
    // 剥注释：上面那段 TSDoc 里逐字写着这个包名 —— 解释理由的话不该把断言打红。
    expect(stripTsComments(read('setup_rxdb.ts'))).not.toContain('@aiao/rxdb-adapter-electron');
  });

  it('库名走 db-names.ts，不从工厂模块里 import', () => {
    expect(read('setup_rxdb.ts')).toContain("from './db-names'");
    for (const file of ['setup_rxdb_desktop.ts', 'setup_rxdb_desktop_pglite.ts', 'setup_rxdb_wa-sqlite.ts']) {
      expect(read(file), file).toContain("from './db-names'");
    }
  });

  it('运行时判定留在 provideRxDB 工厂内，两个建库模块不调用 inject()', () => {
    const config = read('app.config.ts');
    expect(config).toContain('isPlatformBrowser(inject(PLATFORM_ID))');
    expect(config).toContain('return localDatabase();');
    for (const file of ['setup_rxdb_desktop.ts', 'setup_rxdb_wa-sqlite.ts']) {
      // 剥注释：这两个模块的 TSDoc 里逐字写着「本模块不调用 `inject()`」。
      expect(stripTsComments(read(file)), file).not.toMatch(/\binject\(/);
    }
  });

  /**
   * 建库 Promise 只能有一份：`provideRxDB` 的工厂与 `LocalDatabaseService.start()` 是两个
   * 并发跑的 app initializer（Angular 用 `Promise.all`），各建各的就成了两个实例 ——
   * 页面读到的状态属于其中一个，数据却写进另一个。
   */
  it('建库 Promise 由 localDatabase 记住，两个 initializer 共用一份', () => {
    expect(read('setup_rxdb.ts')).toMatch(/database \?\?= resolveLocalBackend\(globalThis\)\.create\(\)/);
    // 服务必须 await 那个被记住的 handle。自己去 `create()` 一次就是第二个实例：
    // `provideRxDB` 持有的那个照常连接，而页面上的状态与计数属于另一个。
    const service = stripTsComments(read('services/local-database.service.ts'));
    expect(service).toContain('await localDatabase()');
    // 服务读候选是为了拿适配器名（`#backend`），到此为止；`create()` 只能由 `localDatabase()` 调。
    expect(service).not.toMatch(/#backend\.create\(|resolveLocalBackend\([^)]*\)\.create\(/);
  });
});
