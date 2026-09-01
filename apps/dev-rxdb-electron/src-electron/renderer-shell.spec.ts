/**
 * @fileoverview ELEC-09 / ELEC-10：渲染进程外壳（CSP、index 变体、路由策略）的静态门禁。
 *
 * @remarks
 * 这些断言看着像「测配置文件」，但每一条都对应一次在 `file:` 下实测到的真实故障，
 * 见各用例上方的注释。真正的端到端验证在 `apps/dev-rxdb-electron-e2e`，
 * 那个需要 `electron-builder` 产出真实产物；本文件是不依赖打包的第一道门。
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const appDir = resolve(import.meta.dirname, '..');
const read = (relative: string): string => readFileSync(resolve(appDir, relative), 'utf8');

/**
 * 去掉 HTML 注释后再断言。
 *
 * 本文件的注释里会逐字引用 `<base href="./">` 之类的反例来解释缘由，
 * 被测文件同样如此 —— 不剥注释的话「不含 `<base>`」会被解释性注释本身打红。
 */
const stripHtmlComments = (html: string): string => html.replace(/<!--[\s\S]*?-->/g, '');

/**
 * 去掉 TS 注释后再断言。
 *
 * 同 {@link stripHtmlComments}：被测的 `setup_rxdb_*.ts` 会在 TSDoc 里逐字解释
 * 「本模块**不调用** `inject()`」，`home.page.html` 的注释里也写着两个后端名 ——
 * 不剥注释的话，正是那句说明理由的话把断言打红。
 *
 * 只剥不含引号的行注释：`'https://…'` 这类字符串里的 `//` 不该被当成注释切掉。
 * 本仓的源码里没有「字符串里带 `//` 且同行还有真注释」的写法，这个近似足够了。
 */
const stripTsComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[^'"`\n]*?\/\/.*$/gm, '');

/**
 * 从一份 HTML 里取出 meta CSP 的 `content`，并按指令名拆成表。
 *
 * 属性顺序不固定：源文件是 `content` 在前，构建产物经 Angular 重排后仍是
 * `content` 在前、`http-equiv` 在后，因此这里整标签匹配再挑属性，不依赖顺序。
 */
function parseCsp(html: string): Map<string, string> {
  const tag = [...html.matchAll(/<meta\b[^>]*>/g)].find(m => m[0].includes('Content-Security-Policy'));
  if (!tag) throw new Error('未找到 meta CSP');
  const content = /content="([^"]+)"/.exec(tag[0]);
  if (!content) throw new Error('meta CSP 没有 content');
  const table = new Map<string, string>();
  for (const directive of content[1].split(';')) {
    const trimmed = directive.trim();
    if (trimmed.length === 0) continue;
    const spaceAt = trimmed.indexOf(' ');
    if (spaceAt === -1) {
      table.set(trimmed, '');
      continue;
    }
    table.set(trimmed.slice(0, spaceAt), trimmed.slice(spaceAt + 1).trim());
  }
  return table;
}

describe('ELEC-09 CSP 开发/生产分离', () => {
  const devCsp = parseCsp(read('src/index.html'));
  const prodCsp = parseCsp(read('src/index.prod.html'));

  // 四条指令缺席时，`<object>`/`<embed>`、`<base>` 改写、iframe 与表单外发全都不受限。
  // 它们与开发态无关，两份 index 必须一致地带上。
  it.each([
    ['object-src', "'none'"],
    ['base-uri', "'none'"],
    ['frame-src', "'none'"],
    ['form-action', "'none'"]
  ])('两份 index 都声明 %s %s', (directive, value) => {
    expect(devCsp.get(directive)).toBe(value);
    expect(prodCsp.get(directive)).toBe(value);
  });

  // 生产产物由 file: 加载，不存在 dev server；放行 localhost 等于白送一条外连通道。
  it('生产 CSP 不含 localhost 白名单', () => {
    expect(prodCsp.get('connect-src')).toBe("'self'");
  });

  // ELEC-22：`script-src 'self'` 会连带禁掉 **WebAssembly 编译**。实测报错原文：
  //   WebAssembly.compileStreaming(): Compiling or instantiating WebAssembly module
  //   violates the following Content Security policy directive because 'unsafe-eval'
  //   is not an allowed source of script in ... "script-src 'self'"
  // wa-sqlite 整个引擎就是一份 .wasm，缺这一条 = 数据库永远起不来。
  // 用 'wasm-unsafe-eval' 而不是 'unsafe-eval'：前者只解禁 WebAssembly 编译，
  // 后者会把 eval()/new Function() 一起放行。
  // 下面的 not.toContain 带着首尾单引号，因此不会被 'wasm-unsafe-eval' 自身命中
  //（它里面 unsafe-eval 前面是连字符不是引号）。
  it('两份 index 的 script-src 放行 wasm 编译但不放行 eval', () => {
    for (const csp of [devCsp, prodCsp]) {
      expect(csp.get('script-src')).toContain("'wasm-unsafe-eval'");
      expect(csp.get('script-src')).not.toContain("'unsafe-eval'");
    }
  });

  // 开发态删掉 localhost，dev server 与 HMR 会直接断连 —— 这是 ELEC-09 明确点名的风险。
  it('开发 CSP 保留 dev server 与 HMR 白名单', () => {
    const connect = devCsp.get('connect-src') ?? '';
    expect(connect).toContain('http://localhost:*');
    expect(connect).toContain('ws://localhost:*');
  });

  // 两份文件极易漂移：只允许 connect-src 不同，其余指令必须逐字一致。
  it('两份 index 的 CSP 只允许 connect-src 有差异', () => {
    expect([...prodCsp.keys()].sort()).toEqual([...devCsp.keys()].sort());
    for (const [directive, value] of devCsp) {
      if (directive === 'connect-src') continue;
      expect({ directive, value: prodCsp.get(directive) }).toEqual({ directive, value });
    }
  });

  it('production 配置指向 index.prod.html 并输出为 index.html', () => {
    const project = JSON.parse(read('project.json'));
    expect(project.targets['ng-build'].configurations.production.index).toEqual({
      input: 'apps/dev-rxdb-electron/src/index.prod.html',
      output: 'index.html'
    });
  });
});

describe('ELEC-10 file: 协议下的生产外壳', () => {
  it('打包目标不覆盖调用方的 Electron 镜像，e2e 解包不依赖本机签名身份', () => {
    const project = JSON.parse(read('project.json'));
    for (const target of ['electron-build', 'electron-package-dir']) {
      expect(project.targets[target].options.env ?? {}).not.toHaveProperty('ELECTRON_MIRROR');
    }
    expect(project.targets['electron-package-dir'].options.env).toEqual({ CSC_IDENTITY_AUTO_DISCOVERY: 'false' });
  });

  // 实测：PathLocationStrategy 在 file: 下调用 history.replaceState('file:///.../home')，
  // Chromium 抛 SecurityError（opaque origin 不允许改 history state 的 URL），
  // 导航中断 —— router-outlet 存在但永远是空的，用户看到空白内容区。
  it('路由使用 withHashLocation', () => {
    const source = read('src/app/app.config.ts');
    expect(source).toContain('withHashLocation()');
    expect(source).toMatch(/import\s*\{[^}]*\bwithHashLocation\b[^}]*\}\s*from\s*'@angular\/router'/);
  });

  // 实测：`getBaseHrefFromDOM()` 在 file: 下把 `<base href="./">` 解析成绝对文件系统路径，
  // HashLocationStrategy 将其拼进 hash，导航目标退化成
  // `file:///…/browser/#/Users/…/browser/home`（hash 前从 index.html 变成目录），
  // Chromium 判跨文档、replaceState 仍抛 SecurityError。只有空 baseHref 才能同文档导航。
  // 断言落在 import 与 provider 结构上，而不是裸字符串 —— 上方注释里就写着
  // `getBaseHrefFromDOM` 这个反例，按子串匹配会自己打自己。
  it('APP_BASE_HREF 为空串且不从 DOM 推断', () => {
    const source = read('src/app/app.config.ts');
    expect(source).not.toMatch(/import\s*\{[^}]*\bPlatformLocation\b/);
    expect(source).not.toMatch(/useFactory:[^\n]*getBaseHrefFromDOM/);
    expect(source).toMatch(/provide:\s*APP_BASE_HREF,\s*\n\s*useValue:\s*''/);
  });

  // 实测：`<base href="./">` 把文档 base URL 换成目录，`#/home` 于是解析成
  // `…/browser/#/home` 而非 `…/browser/index.html#/home`，Chromium 判跨文档并中断导航。
  // 去掉该标签后同一份产物导航正常、控制台零报错。
  it.each(['src/index.html', 'src/index.prod.html'])('%s 不含 <base> 标签', file => {
    expect(stripHtmlComments(read(file))).not.toMatch(/<base\b/);
  });

  // ELEC-11：`provideRxDB` 现在自带 app initializer，bootstrap 阶段必然跑到工厂 ——
  // 「初始化器确实实例化了数据库」由 packages/rxdb-angular 的 rxdb.provider.spec.ts 锁定。
  // 这里只钉两件 demo 侧的事：source 确实交给了 provideRxDB（漏掉的话状态卡会永久停在
  // 「连接中…」且零诊断信号：无 worker、无请求、无报错），以及别再手写那一刀补偿式注入。
  it('RxDB 由 provideRxDB 在 bootstrap 阶段接管', () => {
    const source = read('src/app/app.config.ts');
    // US-207 E11 起 source 是个异步工厂（候选的 create 走动态 import），不再是裸函数引用。
    expect(source).toMatch(/provideRxDB\(\(\)\s*=>\s*\{/);
    expect(source).toContain('return localDatabase();');
    expect(source).not.toMatch(/provideAppInitializer\(\(\)\s*=>\s*\{\s*\n\s*inject\(RxDB\);/);
  });

  // US-207 E11：`inject()` 一旦跨过 `await` 就离开注入上下文，NG0203 的报错文案与存储
  // 毫无关系 —— 排查会从「数据库没起来」一路绕到依赖注入上。工厂模块由动态 `import()`
  // 加载，调用点必然已在 await 之后，因此那道浏览器闸必须留在 app.config.ts 的工厂里。
  it('运行时判定留在 provideRxDB 工厂内，两个建库模块不调用 inject()', () => {
    expect(read('src/app/app.config.ts')).toContain('isPlatformBrowser(inject(PLATFORM_ID))');
    for (const file of ['src/app/setup_rxdb_desktop.ts', 'src/app/setup_rxdb_wa-sqlite.ts']) {
      // 剥注释：这两个模块的 TSDoc 里逐字写着「本模块不调用 `inject()`」。
      expect(stripTsComments(read(file)), file).not.toMatch(/\binject\(/);
    }
  });

  // 候选表必须 `import()` 而不是静态 import：静态导入会把桌面适配器与 wa-sqlite 一起
  // 拉进首包，「没被选中的那条后端不进产物」这条结论随之失效（下面的产物断言由
  // scripts/audit 负责，这里先拦住源码形态）。
  it('两个后端各自走动态 import 加载', () => {
    const source = read('src/app/setup_rxdb.ts');
    expect(source).toMatch(/await import\('\.\/setup_rxdb_desktop'\)/);
    expect(source).toMatch(/await import\('\.\/setup_rxdb_wa-sqlite'\)/);
    expect(source).not.toMatch(/^import .*setup_rxdb_(desktop|wa-sqlite)/m);
  });

  // wasmPath 曾用 APP_BASE_HREF 拼；该 token 现在固定空串，拼出来是裸相对路径，
  // 只是碰巧能在 worker 里解析对。改为显式相对 document.baseURI。
  it('wasm 路径相对 document.baseURI 解析而非 APP_BASE_HREF', () => {
    const source = read('src/app/setup_rxdb_wa-sqlite.ts');
    expect(source).toContain("new URL('wa-sqlite/', document.baseURI)");
    expect(source).not.toMatch(/import\s*\{[^}]*\bAPP_BASE_HREF\b/);
    expect(source).not.toMatch(/wasmPath:\s*`\$\{baseHref\}/);
  });

  // 实测：inlineCritical 会生成 `<link ... media="print" onload="this.media='all'">`，
  // 内联事件处理器被 `script-src 'self'` 挡掉，延迟样式表永远停在 media="print"，
  // 生产产物只剩内联的 critical CSS。
  it('生产构建关闭 inlineCritical（内联 onload 会被 CSP 拦截）', () => {
    const project = JSON.parse(read('project.json'));
    expect(project.targets['ng-build'].configurations.production.optimization?.styles?.inlineCritical).toBe(false);
  });

  // ELEC-22：生产入口从 `file:` 换到自定义协议。三条实测理由见 main.utils.ts 里
  // APP_SCHEME 的注释；这里钉住「不许回退到 loadFile」，因为回退后应用连
  // ESM 入口都加载不了，而症状（白屏 + 一堆 CORS 报错）与本轮修过的其它几条极像。
  it('生产入口走 app: 自定义协议而不是 loadFile', () => {
    const source = read('src-electron/main.ts');
    expect(source).toContain('registerSchemesAsPrivileged');
    expect(source).toContain('protocol.handle(APP_SCHEME');
    // 生产入口仍是 APP_ENTRY_URL（US-208 起可带 ?pglite=1 查询参数），而不是回退到 loadFile。
    expect(source).toContain('APP_ENTRY_URL');
    expect(source).toMatch(/loadURL\(entryUrl\)/);
    expect(source).not.toMatch(/\bloadFile\(/);
  });

  // 少一条权限就少一堵墙塌掉：standard 决定有没有真 origin（相对路径与 CSP 的 'self'），
  // secure 决定 OPFS/Worker 可不可用，supportFetchAPI 决定 .wasm 取不取得到。
  it.each(['standard', 'secure', 'supportFetchAPI'])('自定义协议声明 %s 权限', privilege => {
    expect(read('src-electron/main.ts')).toMatch(new RegExp(`${privilege}:\\s*true`));
  });
});

describe('US-207 桌面 SQLite 在渲染进程一侧的接线', () => {
  // 同一个包分两个入口：包根是 renderer 侧（只说协议），`/host` 才 import `node:sqlite`。
  // renderer 误导入 `/host` 时 Angular 解析不了 `node:` 内建，构建直接失败；
  // 真正危险的是被某个 polyfill 接住的情形 —— 那就成了一份跑在渲染进程里的空壳库，
  // 写入落在内存、重启即失，而 US-207 的全部意义正是「别再只存在于 WebView 里」。
  it.each(['src/app/setup_rxdb_desktop.ts', 'src/app/services/desktop-environment.ts'])(
    '%s 不碰 /host 子路径',
    file => {
      expect(read(file)).not.toContain('@aiao/rxdb-adapter-electron/host');
    }
  );

  // 只有建库模块该用包根入口。它经由动态 `import()` 落在自己的 chunk 里，
  // 整个 barrel 跟进来无妨 —— 而 `desktop-environment.ts` 在主 chunk 里，
  // US-207 E11 起它连包根都不 import（键名改抄字面量，由单测钉住；理由见那边的 TSDoc）。
  it('setup_rxdb_desktop.ts 走包根入口取适配器', () => {
    expect(read('src/app/setup_rxdb_desktop.ts')).toContain("from '@aiao/rxdb-adapter-electron'");
  });

  // 与 ELEC-11 同一个坑的另一种形态：`providedIn: 'root'` 的服务同样是惰性的，
  // 没有组件注入它就永远不构造 —— 卡片停在「连接中…」，且没有 worker、没有请求、没有报错。
  // US-207 E8 起改由 initializer 拉起（首页只读信号，不再承担「注入即触发」的职责）。
  it('连接由 app initializer 拉起，而不是等首页注入', () => {
    expect(read('src/app/app.config.ts')).toMatch(
      /provideAppInitializer\(\(\)\s*=>\s*inject\(LocalDatabaseService\)\.start\(\)\)/
    );
  });

  // AC#8 的打包 e2e 靠这几个 testid 断言「重启后计数 +1」，E9 还靠 `rxdb-backend` 断言
  // 选中的确实是桌面后端。改名不会让 e2e 变红，只会让它在等待选择器时超时 ——
  // 排查成本远高于这条断言。（合并成一张卡之前它们叫 `desktop-*`。）
  it.each(['rxdb-status', 'rxdb-error', 'rxdb-launch-count', 'rxdb-backend', 'rxdb-db-name'])('首页暴露 %s', testId => {
    expect(read('src/app/pages/home/home.page.html')).toContain(`data-testid="${testId}"`);
  });

  // E9：后端名必须从选中的候选读出，而不是模板里另写一遍字面量 ——
  // 否则「卡片写着 A、数据落在 B」这种自相矛盾的显示看不出来，e2e 也就失去了判据。
  it('首页显示的后端名来自选中的候选而非硬编码', () => {
    // 剥注释：模板顶上那段说明合并缘由的注释里就写着两个后端名。
    const template = stripHtmlComments(read('src/app/pages/home/home.page.html'));
    expect(template).toMatch(/data-testid="rxdb-backend">\{\{ backend \}\}/);
    expect(template).not.toContain('sqlite-electron');
    expect(template).not.toContain('wa-sqlite');
  });
});

describe('US-504 本地文件存储在渲染进程一侧的接线', () => {
  // 插件的 install() 是往 `config.entities` 里追加 StorageFileMeta。`init()` 之后再 use()，
  // 建表那一步早已跑完 —— metadata 表不存在，而症状是运行期某次 upload 才炸，
  // 离真正的原因隔着一整个启动流程。顺序在这里钉死，比事后排查便宜得多。
  //
  // 两个后端都要查：浏览器预览那份漏了 use()，`/storage` 页在 `nx serve` 下会直接炸在
  // `rxdb.storage` 上 —— 而这个 demo 想让人看见的恰恰是「同一个页面、同一套 API」。
  it.each(['src/app/setup_rxdb_desktop.ts', 'src/app/setup_rxdb_wa-sqlite.ts'])(
    '%s 的 use(rxDBPluginStorage) 排在 init() 之前',
    file => {
      const source = read(file);
      const useAt = source.indexOf('use(rxDBPluginStorage');
      const initAt = source.indexOf('.init()');
      expect(useAt).toBeGreaterThan(-1);
      expect(initAt).toBeGreaterThan(-1);
      expect(useAt).toBeLessThan(initAt);
    }
  );

  // 后端不接进来，文件内容仍旧落在 WebView 的 OPFS 里 —— 页面照常能用，
  // 只有「拷走 userData 再恢复」时才暴露：meta 还在，文件没了。
  it('桌面分支接入桌面文件后端并显式指定 rootDir', () => {
    const factory = read('src/app/setup_rxdb_desktop.ts');
    expect(factory).toContain("from '@aiao/rxdb-plugin-storage/desktop'");
    expect(factory).toContain('createDesktopStorageFilesystem()');
    expect(factory).toMatch(/rootDir:\s*DESKTOP_STORAGE_ROOT_DIR/);
  });

  // US-207 E10：storage 后端不自己探测运行时，跟着同一次后端判定走。浏览器预览那份
  // 一旦也接上桌面文件系统，插件的 `adapter_mismatch` 会在启用时直接拒绝 ——
  // 症状离「选错后端」很远，先在源码形态上拦住。
  it('浏览器预览分支不接桌面文件后端', () => {
    expect(read('src/app/setup_rxdb_wa-sqlite.ts')).not.toContain('@aiao/rxdb-plugin-storage/desktop');
  });

  // 与 US-207 同型：`/host` 会把 node:sqlite 拖进 renderer bundle。
  it.each(['src/app/setup_rxdb_desktop.ts', 'src/app/pages/storage/storage.page.ts'])(
    '%s 不碰适配器的 /host 子路径',
    file => {
      expect(read(file)).not.toContain('@aiao/rxdb-adapter-electron/host');
    }
  );

  // 路由缺了这一条，storage 页会被 `**` 兜底吞成首页 —— e2e 只会看到「找不到选择器」。
  it('storage 路由排在 ** 兜底之前', () => {
    const routes = read('src/app/app.routes.ts');
    expect(routes.indexOf("path: 'storage'")).toBeGreaterThan(-1);
    expect(routes.indexOf("path: 'storage'")).toBeLessThan(routes.indexOf("path: '**'"));
  });

  // 打包 e2e（AC#1 / #3 / #5）全靠这些 testid 驱动；改名不会让 e2e 变红，
  // 只会让它在等待选择器时超时。
  it.each([
    'storage-status',
    'storage-error',
    'storage-path',
    'storage-entries',
    'storage-entry',
    'storage-refresh',
    'storage-generate-name',
    'storage-generate-size',
    'storage-generate-upload',
    'storage-verify',
    'storage-digest',
    'storage-delete'
  ])('storage 页暴露 %s', testId => {
    expect(read('src/app/pages/storage/storage.page.html')).toContain(`data-testid="${testId}"`);
  });
});

describe('ELEC-21 worker 共享 chunk 不能被 chunk optimizer 删掉', () => {
  // @angular/build 22.0.5 的 `optimizeChunks`（懒加载 chunk ≥ 3 时默认启用）只把
  // **main 这一个入口**交给 rollup 重新打包，然后把被 rollup 吃掉的原 chunk
  // 从产物里删除（chunk-optimizer.js:243 `input: mainFile`、:292 的 filter）。
  // Web Worker 是独立的 esbuild 入口，不在 rollup 的 input 里 —— 于是
  // worker 与 main 共享的那几个 chunk 被删了，worker 里的 import 全部悬空。
  //
  // 实测于本应用的生产产物：`worker-*.js` 请求 `chunk-BYXBJQAS.js` 得到
  // `net::ERR_FILE_NOT_FOUND`，wa-sqlite 永远停在「连接中…」。同一份代码
  // 加上 NG_BUILD_OPTIMIZE_CHUNKS=0 重新构建，悬空引用从 4 个变 0 个。
  //
  // 该阈值只有环境变量这一个入口（environment-options.js:145，没有 builder 选项），
  // 所以 build 只能包一层 run-commands 来注入；真正的构建在 ng-build。
  const project = JSON.parse(read('project.json'));

  it('build 以 NG_BUILD_OPTIMIZE_CHUNKS=0 委托给 ng-build', () => {
    const build = project.targets.build;
    expect(build.executor).toBe('nx:run-commands');
    expect(build.options.env).toEqual({ NG_BUILD_OPTIMIZE_CHUNKS: '0' });
    expect(build.options.command).toContain('dev-rxdb-electron:ng-build');
  });

  it('ng-build 才是 Angular application builder，且 serve 指向它', () => {
    expect(project.targets['ng-build'].executor).toBe('@angular/build:application');
    for (const configuration of Object.values<{ buildTarget?: string }>(project.targets.serve.configurations)) {
      expect(configuration.buildTarget).toMatch(/^dev-rxdb-electron:ng-build:/);
    }
  });

  // 这层包装会 fork 出**第二个 nx 进程**。默认情况下那个进程会把 ng-build 的
  // `dependsOn: ["^build"]` 再展开一遍，于是同一场构建里两个 nx 同时管理
  // `packages/*/dist`：外层 run-many 正在跑 dev-rxdb-supabase:build 读
  // `packages/rxdb-test/dist/entities/index.d.ts`，内层 nx 同时把 rxdb-test:build
  // 从本地缓存重新落盘（落盘 = 先删目标目录再拷贝），读到一半文件就没了。
  //
  // 实测：run 32102602589（main）—— 05:27:11 内层打出
  // `> nx run rxdb-test:build [local cache]`，05:27:22 外层
  // dev-rxdb-supabase 报 `TS2307: Cannot find module '@aiao/rxdb-test/entities'`。
  // 本机跑同一条命令是绿的，因为内层命中的是「existing outputs match the cache,
  // left as is」这条不落盘的分支 —— 这个 bug 只在缓存状态刚好不同时现形。
  //
  // 修法是让内层只跑 ng-build 这一个任务：依赖由外层 build 的 `^build` 保证已就绪，
  // 内层再算一遍纯属重复劳动，而这份重复劳动正是唯一的写冲突来源。
  // 两条断言互为前提，缺一不可 —— 去掉 `^build`，`--excludeTaskDependencies`
  // 就变成「依赖根本没人建」。
  it('build 自己声明 ^build，且禁止内层 nx 再展开一遍依赖图', () => {
    const build = project.targets.build;
    expect(build.dependsOn).toEqual(['^build']);
    expect(build.options.command).toContain('--excludeTaskDependencies');
  });
});
