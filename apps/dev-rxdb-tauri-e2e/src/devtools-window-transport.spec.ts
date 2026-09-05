import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runSelfCheck, type DevToolsNativeProbe, type SelfCheckRun } from './packaged-app';

/**
 * US-905 阶段 1 AC#1 / AC#2：两个**真实** Tauri WebView 起来了并完成了握手。
 *
 * @remarks
 * # 为什么不上 WebDriver
 *
 * `tauri-driver` 在 macOS 上不存在（`packaged-app.ts` 头注已记）。但 AC 要的并不是
 * 「能点面板上的按钮」，而是「真实主窗口与调试窗口已打开」并完成往返——这两件事有
 * 一条不经 WebDriver 的观察路径：**自检报告**。
 *
 * 证据分两路，各自只由看得见它的一方给：
 *
 * - **窗口**（AC#1）：Rust 侧在结算时刻枚举 `webview_windows()`，写进 `windowLabels`。
 *   窗口建没建起来只有主进程说了算；让 renderer 上报的话，`#[cfg(dev)]` 那道编译期隔离
 *   就退化成了一句自述。
 * - **握手**（AC#2）：主 WebView 订阅与 connector **同一条** `devtools:message` 事件，
 *   记录调试窗口发过来的 v2 帧类型。中继按窗口 label 定向投递，所以能在 `main` 上收到
 *   `HANDSHAKE_ACK`，就同时证明了调试窗口真的建起来了、它加载的是共享面板、
 *   面板协商到了 v2、而且帧走完了真实 Rust 中继。
 *
 * # 为什么必须是 dev 产物，而且要自己起一个 1420
 *
 * `open_devtools_window` 与 `devtools_message` 都在 `#[cfg(dev)]` 下，而 `cfg(dev)` 由
 * tauri crate 的 build.rs 按 `has_feature("custom-protocol")` 取反得出。`tauri build`
 * 会打开那个 feature——于是 release 产物里这两样东西**根本不存在**（AC#1 的隔离判据正是
 * 这个）。所以本套件跑的是 `cargo build` 出来的 debug 产物，而它按 `tauri.conf.json` 的
 * `devUrl` 取前端，因此本文件自己在 **1420** 上服务 `dist/apps/dev-rxdb-tauri/browser`。
 *
 * 端口是配置写死的，不能换。被占用时**显式失败**而不是另挑一个：另挑一个的话应用会连到
 * 那个占着 1420 的东西上，失败形态变成「白屏 + 看门狗超时」，与前端挂死无法区分。
 *
 * # 握手曾经握不上，卡在一条构建配置缺陷上（2026-09-04 修复）
 *
 * 这三条断言第一次写出来时只有第一条绿。真因不在协议也不在 transport，而在构建图：
 * `build-devtools`（vite 打面板，产出 `dist/apps/dev-rxdb-tauri/browser/devtools/`）原先**跑在
 * `build` 之前**，而它的产物是 `build` 的 outputs（`dist/apps/dev-rxdb-tauri`）的**子目录**，
 * 自己又没有声明 `outputs`。于是 `build` 一命中 nx 缓存，恢复产物时整个父目录被换掉、
 * `devtools/` 连带消失，而 `build-devtools` 也命中缓存被跳过、没人再写回去。
 * 调试窗口于是 404，面板根本不 bootstrap，一帧都不发——而构建全程报绿。
 *
 * 修法是把依赖**反过来**（`build-devtools` dependsOn `build`）并给它声明 `outputs` + `cache`，
 * 面板产物因此总是最后落盘。实测判据：清空 `dist/` 后跑一次拿到 20/20 全缓存命中，
 * `devtools/` 与 `index.html` 同时在位——那正是以前必然翻车的那一格。
 *
 * ⚠️ 依赖 dev 产物。跑之前：
 *   pnpm nx run dev-rxdb-tauri:tauri-package-dev
 *   （devtools-smoke target 的 dependsOn 本应替你跑掉这一步。）
 */

/** 驱动留在盘上的目录名，与 `src-tauri/devtools_driver.js` 的 `KEPT_DIR` 一致。 */
const KEPT_DIR = 'drv-kept';

/** 驱动建了就删的目录名，与驱动的 `TEMP_DIR` 一致。 */
const TEMP_DIR = 'drv-temp';

/** 字节往返用的文件名，与驱动的 `BYTES_FILE` 一致。 */
const BYTES_FILE = 'drv-bytes.bin';

/** 零字节上传的目标名，与驱动的 `EMPTY_FILE` 一致。 */
const EMPTY_FILE = 'drv-empty.bin';

/** 取消用例的目标名，与驱动的 `CANCELLED_FILE` 一致；它永远不该出现在盘上。 */
const CANCELLED_FILE = 'drv-cancelled.bin';

/**
 * 往返载荷，与驱动的 `payloadBytes()` 逐字节相同。
 *
 * @remarks
 * 两侧各算一遍而不是一侧算好传过去：传过去的话，「盘上的字节等于驱动送出的字节」这句话
 * 就退化成「盘上的字节等于盘上的字节」——判据必须有一个独立于被测链路的来源。
 * 取一个**非常量**的模式（`i * 31 + 7`）而不是填充同一个值：全 `0x00` 的载荷里，
 * 少写一块、多写一块、块序颠倒三种缺陷全都看不出来。
 */
const payloadBytes = (): Buffer => {
  const bytes = Buffer.alloc(700);
  for (let index = 0; index < bytes.length; index += 1) bytes[index] = (index * 31 + 7) & 0xff;
  return bytes;
};

/** `tauri.conf.json` 的 `devUrl` 写死的端口。 */
const DEV_URL_PORT = 1420;

/** 前端产物目录，与 `dev-rxdb-tauri` 的 build outputPath 一致。 */
const FRONTEND_DIST = resolve(import.meta.dirname, '..', '..', '..', 'dist', 'apps', 'dev-rxdb-tauri', 'browser');

/** 最小 MIME 表；够本 demo 的产物用。 */
const MIME: Readonly<Record<string, string>> = Object.freeze({
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2'
});

/**
 * 在 1420 上服务前端产物。
 *
 * @returns 关闭手柄
 * @throws 端口被占用时抛出，并说清该去关掉什么
 *
 * @remarks
 * 目录穿越用 `startsWith(FRONTEND_DIST)` 挡住：这是个跑在开发机上的临时服务，
 * 但让它能读产物目录之外的文件没有任何好处。
 *
 * 找不到的路径回退到 `index.html`（面板与应用都是 hash 路由的 SPA），
 * 但**只对不带扩展名的路径**回退：给一个 404 的 `.js` 返回 HTML，
 * 表征会是一句与真因毫无关系的语法错误。
 */
async function serveFrontend(): Promise<{ close: () => Promise<void> }> {
  const server: Server = createServer((request, response) => {
    const path = (request.url ?? '/').split('?')[0];
    const wanted = resolve(FRONTEND_DIST, `.${path === '/' ? '/index.html' : path}`);
    const target = wanted.startsWith(FRONTEND_DIST) ? wanted : FRONTEND_DIST;
    void readFile(target)
      .catch(async error => {
        if (extname(target) !== '') throw error;
        return readFile(join(FRONTEND_DIST, 'index.html'));
      })
      .then(body => {
        response.writeHead(200, { 'content-type': MIME[extname(target)] ?? 'application/octet-stream' }).end(body);
      })
      .catch(() => response.writeHead(404).end());
  });

  await new Promise<void>((settle, fail) => {
    server.on('error', error => {
      fail(
        new Error(
          [
            `无法在 ${String(DEV_URL_PORT)} 上启动前端服务：${String(error)}`,
            '这个端口是 tauri.conf.json 的 devUrl 写死的，换不了。',
            '多半是有一个 `nx serve dev-rxdb-tauri` 还开着——先关掉它再跑。'
          ].join('\n')
        )
      );
    });
    server.listen(DEV_URL_PORT, '127.0.0.1', () => settle());
  });

  return {
    close: () =>
      new Promise<void>((settle, fail) => {
        server.close(error => (error ? fail(error) : settle()));
      })
  };
}

/** UUID v4，与 `v2/ids.ts` 生成的形状一致。 */
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** 把失败报告里的原因带进断言消息。 */
const because = (run: SelfCheckRun): string => run.report.message ?? '(报告里没有原因)';

describe('dev 产物里的两个真实 WebView（US-905 阶段 1 AC#1 / AC#2）', () => {
  let frontend: { close: () => Promise<void> };
  let workspace: string;
  let run: SelfCheckRun;
  /** 文件存储的物理根：外层 `rxdb-files` 由 Rust 定，内层 `files` 由 storage 插件的 rootDir 定。 */
  let storageRoot: string;

  // 一次启动供全部断言共用：它们看的本来就是同一次启动的同一份事实。
  beforeAll(async () => {
    frontend = await serveFrontend();
    workspace = mkdtempSync(join(realpathSync(tmpdir()), 'rxdb-tauri-devtools-'));
    const dataDir = join(workspace, 'app-data');
    mkdirSync(dataDir);
    storageRoot = join(dataDir, 'rxdb-files', 'files');

    run = await runSelfCheck({
      dataDir,
      reportPath: join(workspace, 'selfcheck-devtools.json'),
      devtoolsProbe: true,
      profile: 'debug'
    });
    expect(run.report.status, because(run)).toBe('ok');
  }, 180_000);

  afterAll(async () => {
    await frontend.close();
    rmSync(workspace, { force: true, recursive: true });
  });

  /**
   * AC#1（dev 侧）：**恰好**两个窗口，且其中一个是 `rxdb-devtools`。
   *
   * 用等值而不是 `toContain`：AC 的措辞是「只创建一个 `rxdb-devtools` 窗口」，
   * 多出第三个窗口同样违反它，而 `toContain` 放得过去。
   */
  it('dev 产物恰好创建 main 与 rxdb-devtools 两个窗口', () => {
    expect(run.report.windowLabels).toEqual(['main', 'rxdb-devtools']);
  });

  /**
   * AC#2：调试窗口的帧经真实 Rust 中继到达了主窗口，且完成了 v2 协商。
   *
   * `HANDSHAKE_ACK` 的所有权归面板（阶段 B 冻结的规则：中继不得代发），所以主窗口收到它
   * 只可能是调试窗口里的共享面板发的——这一条同时排除了「窗口建起来了但面板没加载」
   * 和「面板加载了但退到了 v1」两种半成立的状态。
   */
  it('调试窗口完成 v2 握手，session id 是一个 UUID v4', () => {
    const devtools = run.report.devtools;
    expect(devtools, `报告里没有 devtools 探针结果：${because(run)}`).not.toBeNull();
    expect(
      devtools?.handshakeCompleted,
      `没等到 HANDSHAKE_ACK；主窗口收到的帧类型：${devtools?.panelFrameTypes.join(', ') || '(一帧都没有)'}`
    ).toBe(true);
    expect(devtools?.panelFrameTypes).toContain('HANDSHAKE_ACK');
    expect(devtools?.sessionIds[0]).toMatch(UUID_V4);
  });

  /**
   * AC#4：**同 label** 关掉再建一次，B 必须是另一个 UUID v4 session。
   *
   * 关窗与重开由主进程的 `rxdb_devtools_recycle_window` 做——这套 e2e 是进程级驱动，
   * 外面没有手能去点那个窗口的关闭按钮；那条命令 `#[cfg(dev)]` + 探针门禁两道闸，
   * release 里根本不存在。
   *
   * 判据取**两个 id 都在且不相等**，而不是「最后那个是 UUID」：后者在「一直复用同一个 session」
   * 的实现下同样成立，而那正是 Electron 侧 US-904 AC#51 上真实发生过的缺陷
   * （光关 session 不换端点，下一个面板拿到的是同一个身份）。
   */
  it('同 label 重开调试窗口后，拿到的是另一个 session', () => {
    // 只看**前两轮**：第三轮是主窗口刷新（AC#5 那条用例的判据），不属于本条。
    const ids = run.report.devtools?.sessionIds ?? [];
    expect(ids.length, `只握上手 ${String(ids.length)} 轮，重开那一轮没发生`).toBeGreaterThanOrEqual(2);
    expect(ids[1]).toMatch(UUID_V4);
    expect(ids[1], '同 label 重开之后复用了上一轮的 session').not.toBe(ids[0]);
  });

  /**
   * AC#5：主窗口**刷新**之后，面板那侧也要认得出「对端换了」并重新协商。
   *
   * connector 随页面一起重建，而调试窗口从头到尾没动过——这一轮握手因此只可能来自面板
   * 自己发现旧 session 作废、重新开口。三轮 id 两两不等，是「每条 transport connection
   * 一个身份」这条规则在真实窗口上的完整证据。
   *
   * 顺带把 AC#5 的另一半（`transport 断开`）也覆盖了：上一条用例的窗口回收走的正是那条路。
   *
   * # 这一条曾经只握上手两轮（2026-09-04 修复）
   *
   * 主窗口刷新之后，调试窗口里的面板**不重新协商**——US-904 AC#51 那条缺陷的**镜像**：
   * 那次是 connector 侧不知道面板没了（已修：中继补发 `DISCONNECT` + connector 换端点），
   * 这次是**面板侧不知道 connector 换了**。面板端点在 `v2` / `v1-facade` 都是终态，
   * 只有 `connectionEpoch` 变化才换新端点，而 Tauri 下它只在**窗口重建**时才变；
   * 主窗口刷新不碰调试窗口，于是面板一直对着一个已经不存在的 session 说话，
   * 而连接守卫因为收到 v1 握手照样显示「已连接」。
   *
   * 修法与已修的那一半对称，落点在面板 library（`DevToolsEndpointService`）而不是阶段 B
   * 冻结的协商机：**协商落定之后再收到一条 legacy 握手**，就是对端重启的唯一证据，
   * 此时换一个新端点重新协商。`idle` / `awaiting` 期间的握手仍是本轮协商的正常输入。
   */
  it('主窗口刷新之后重新协商，三轮 session 两两不同', () => {
    const ids = run.report.devtools?.sessionIds ?? [];
    expect(ids, `只握上手 ${String(ids.length)} 轮，刷新后那一轮没发生`).toHaveLength(3);
    expect(new Set(ids).size, `三轮里有重复的 session：${ids.join(', ')}`).toBe(3);
    for (const id of ids) expect(id).toMatch(UUID_V4);
  });

  /**
   * AC#3：一扇 label 不在白名单里的**真实窗口**去敲中继，被 Rust 侧拒掉。
   *
   * 这正是白名单存在的理由所写的那个场景——「将来新增的、忘了排除在 capability 之外的窗口」。
   * 冒名窗口拿不到任何 capability（label 不在两份 capability 的 `windows` 里），但**应用自有
   * 命令不经过 capability 门禁**，所以它照样调得到 `devtools_message`；挡住它的只有 label 白名单。
   *
   * 判据取**拒绝计数 > 0** 而不是布尔：`0` 说明那扇窗根本没敲到门，这条用例什么都没验到——
   * 而那与「敲了但被拒」在一个布尔上长得一模一样。
   *
   * 纯函数那一半（`devtools_routing::target_label_of`）另有两条 Rust 单测；这里补的是
   * 「真窗口在真实链路上被拒」那一半。
   */
  it('label 不在白名单里的真实窗口敲中继，会被拒掉', () => {
    expect(run.report.devtools?.relayRejected, '冒名窗口一次都没敲到中继——这条用例没有验到任何东西').toBeGreaterThan(0);
  });

  /**
   * 协商是**面板先开口**的：`PROTOCOL_HELLO` 由面板发出（阶段 B 的方向表把它钉成
   * `panel-to-connector`）。主窗口两条都收到，说明走的是完整协商而不是某条捷径。
   */
  it('主窗口收到的是完整协商序列，而不是只有一条 ACK', () => {
    expect(run.report.devtools?.panelFrameTypes).toEqual(expect.arrayContaining(['PROTOCOL_HELLO', 'HANDSHAKE_ACK']));
  });

  /**
   * 真实双窗口上的 wire 结论（US-905 阶段 2，AC#9 / #12 / #13 的链路一半）。
   *
   * @remarks
   * # 这些断言与 `tauri-conformance.spec.ts` 的 80 条**不重叠**
   *
   * 那 80 条跑在进程内的 JSON 中继上，验的是「Tauri 只适配 transport、不复制状态机」这条
   * 结构性质（发现 7 已把它的边界写清楚）。这里验的是另一件事：**同样的判定在真实
   * `invoke` / `emit_to` 跨窗口投递、经真实 Rust 中继、由真实 native host 应答时也成立**。
   * 帧由调试窗口里的 dev-only 驱动现拼——它不 import 共享包（初始化脚本里没有模块系统），
   * 所以连信封形状都是被真实 connector 校验过的。
   *
   * # 为什么读的是错误码而不是数据
   *
   * AC#13 明写响应不得含路径、SQL 绑定值、加密字段或文件内容。报告里因此只带结果码，
   * 顺带让这些断言天然不依赖机器上的具体文件。
   */
  describe('真实双窗口上的 wire 结论（US-905 阶段 2）', () => {
    const native = () => run.report.devtools?.native;

    it('驱动确实装上了，并且等到了握手', () => {
      // `undefined` 与 `sessionSeen: false` 是两个结论：前者说明脚本根本没注入
      // （`#[cfg(dev)]` 或探针门禁出了问题），后者说明注入了但链路没通。
      expect(native(), '调试窗口里没有驱动——注入那一步没发生').toBeDefined();
      expect(native()?.failure ?? null).toBeNull();
      expect(native()?.sessionSeen).toBe(true);
    });

    /**
     * AC#9 的链路一半：`files` 领域接的是 US-505 的真实 native host。
     *
     * @remarks
     * 判据取「答了 `ok`」而不是条目内容：这台机器上那个目录里有什么不是协议的性质。
     * 接不上 host 时这里会是 `provider_unavailable` / `host_unavailable` 之类的码，
     * 与 `ok` 分得很开。
     */
    it('files.list 经真实 host 应答成功', () => {
      expect(native()?.filesList).toBe('ok');
      // `-1` 是驱动给「这次没读到结果」留的哨兵；读到了就该是一个真实的非负数。
      expect(native()?.filesEntryCount ?? -1).toBeGreaterThanOrEqual(0);
    });

    /**
     * AC#12：两条拒绝码，且**分别**来自两个不同的层。
     *
     * @remarks
     * `export` 是已声明的操作，走到 provider 才被拒；`clear` 没有声明，descriptor 层就该拦下。
     * 两条答同一个码的话，说明其中一层没在做事——而那一层正是「不读 SQLite/WAL」的保证所在。
     */
    it('settings 的两条拒绝在真实链路上成立', () => {
      expect(native()?.settingsExport).toBe('export_unsupported');
      expect(native()?.settingsClear).toBe('provider_unsupported');
    });

    /**
     * AC#13：伪造 session 的同一条请求必须被拒。
     *
     * @remarks
     * 对照组就在上面那条 `files.list`——**同一个操作、同一份参数**，唯一的差别是 session。
     * 所以这里拒掉的只可能是身份，不是操作本身不被支持。
     */
    /**
     * AC#13 的授权矩阵一半：写入必须是**这一次运行**被显式打开的。
     *
     * @remarks
     * 缺省档（不设任何 `DEV_RXDB_DEVTOOLS*`）是 `capability: full` + `mutationPolicy: omit`，
     * 所以这一跑里写入被拒。拒绝码与「这个操作压根没声明」相同（共享包的 `authorizeOperation`
     * 刻意不区分，免得对端据此枚举 provider 目录）——**判别力因此不在码上，在磁盘上**：
     * 下面那条断言盘上一个目录都没落。这也顺带证明了缺省档确实是只读的。
     */
    it('没 opt-in 写入时，建目录被拒且盘上什么都没落', () => {
      expect(native()?.createDirectory).toBe('provider_unsupported');
      expect(native()?.deleteEntry).toBe('provider_unsupported');
      expect(existsSync(join(storageRoot, KEPT_DIR)), '只读档下不该有任何目录落盘').toBe(false);
      expect(existsSync(join(storageRoot, TEMP_DIR))).toBe(false);
    });

    /**
     * AC#10：上传同样要被同一道闸挡住，且一个字节都不落。
     *
     * @remarks
     * 与建目录分开写：写入授权是**按操作**判的，`create-directory` 被拒并不蕴含 `upload`
     * 也被拒——后者走的是 `TRANSFER_START` 那条独立的授权入口（共享包端点里它自己调一次
     * `authorizeOperation`，用的是 `files` + `upload`）。两条各断一次，漏掉哪一条都会让
     * 「只读档下调试窗口写不了盘」这句话缺一块。
     */
    it('没 opt-in 写入时，上传被拒且一个字节都没落盘', () => {
      expect(native()?.uploadBytes).toBe('provider_unsupported');
      expect(native()?.emptyUpload).toBe('provider_unsupported');
      expect(existsSync(join(storageRoot, BYTES_FILE)), '只读档下不该有任何文件落盘').toBe(false);
      expect(existsSync(join(storageRoot, EMPTY_FILE))).toBe(false);
    });

    it('换成伪造的 session，同一条请求被按 session 拒掉', () => {
      // 判据取**观察到的拒绝码**而不是「没答」：拒绝以 session 级 ERROR（`requestId: null`）
      // 回来，驱动因此要单独记它——否则这条用例只能看到一次超时，而超时与「对端挂了」
      // 不可区分，那样的证据撑不起 AC#13 的「未授权 provider 调用为 0」。
      expect(native()?.forgedSession).toBe('session_invalid');
      // 对照组就在上面那条 `files.list`：**同一个操作、同一份参数**，唯一的差别是 session。
      expect(native()?.filesList).toBe('ok');
    });
  });
});

/**
 * 开了授权档的那一跑（US-905 阶段 2，AC#13 的授权矩阵另一半）。
 *
 * @remarks
 * 这一跑是 C2 那条注入链路的**唯一真实证据**：`DEV_RXDB_DEVTOOLS*` 三个环境变量 → Rust 的
 * `devtools_config` 插件 → `js_init_script` 在页面脚本之前写下全局键 → 页内 connector 定档。
 * 单测只能证明每一段自己的规则，证不了这条链在真实窗口里接得上；而它接不上的表现，
 * 恰好与「写入本来就该被拒」一模一样——所以必须有这一跑，上面那条只读用例才有判别力。
 *
 * 单独起一个进程而不是复用上面那一跑：授权档在 bootstrap 期一次性定档，同一个进程里换不了。
 */
describe('开了写入授权的那一跑（US-905 阶段 2）', () => {
  let frontend: { close: () => Promise<void> };
  let workspace: string;
  let run: SelfCheckRun;
  let storageRoot: string;

  beforeAll(async () => {
    frontend = await serveFrontend();
    workspace = mkdtempSync(join(realpathSync(tmpdir()), 'rxdb-tauri-devtools-rw-'));
    const dataDir = join(workspace, 'app-data');
    mkdirSync(dataDir);
    storageRoot = join(dataDir, 'rxdb-files', 'files');

    run = await runSelfCheck({
      dataDir,
      reportPath: join(workspace, 'selfcheck-devtools-rw.json'),
      devtoolsProbe: true,
      profile: 'debug',
      // 三个变量与 Electron 侧逐字同名；`_MUTATION` 只认 `allow`，省略即只读。
      env: {
        DEV_RXDB_DEVTOOLS: '1',
        DEV_RXDB_DEVTOOLS_CAPABILITY: 'full',
        DEV_RXDB_DEVTOOLS_MUTATION: 'allow'
      }
    });
    expect(run.report.status, because(run)).toBe('ok');
  }, 180_000);

  afterAll(async () => {
    await frontend.close();
    rmSync(workspace, { force: true, recursive: true });
  });

  it('授权档确实经 Rust 注入到了页内 connector：同样的写入这次成立', () => {
    const native = run.report.devtools?.native;
    // 诊断带上整份 devtools 探针结果：`native` 整个缺席与「写入被拒」是两种成因，
    // 只看一个 undefined 分不出来（本轮实测踩过）。
    const detail = `devtools=${JSON.stringify(run.report.devtools)}\n${because(run)}`;

    // 与只读那一跑逐字对照：同一个操作、同一份参数、同一份产物，唯一的差别是三个环境变量。
    expect(native?.createDirectory, detail).toBe('ok');
    expect(native?.deleteEntry, detail).toBe('ok');
  });

  it('写入真的落到了盘上，删除也真的把它拿掉了', () => {
    // 码说「成立」，磁盘说「确实发生了」——两者缺一，这条链上任何一段都可以假装成功。
    expect(existsSync(join(storageRoot, KEPT_DIR)), '建目录报了 ok，盘上却没有').toBe(true);
    expect(existsSync(join(storageRoot, TEMP_DIR)), '删除报了 ok，盘上却还在').toBe(false);
  });

  /**
   * AC#10 的字节面：上传的字节经真实链路原样回到面板。
   *
   * @remarks
   * # 为什么判据是「传上去再读回来」而不是只看一个 `ok`
   *
   * 阶段 B 冻结的 wire 里，**成功的上传在线上是静默的**——`TRANSFER_COMPLETE` 之后
   * connector 什么都不回（见 `panel-endpoint.ts` 头注第 2 条）。所以驱动能自证的只有
   * 「已发出」。要把它推到「已提交、且提交的正是那些字节」，唯一的办法是再从同一条链路
   * 读回来逐字节比一遍。
   *
   * # 为什么还要 `uploadChunks`
   *
   * AC#10 写的是「全程流式」。一次 `TRANSFER_CHUNK` 装完全部载荷同样能让字节对上，
   * 而那正是流式没有真正接通的形态。载荷 700 字节、驱动按 256 分块，因此必须是 3 帧。
   */
  it('上传的字节经真实链路原样回到面板（AC#10）', () => {
    const native = nativeOf(run);

    expect(native.uploadBytes, wire(run)).toBe('ok');
    expect(native.uploadChunks, '载荷没被切成多帧——流式那一半没验到').toBe(3);
    expect(native.downloadBytes, wire(run)).toBe('ok');
    expect(native.bytesMatch, '读回来的字节与送出去的不一致').toBe(true);
  });

  it('落盘的正是那些字节，零字节文件也真的建了出来', () => {
    // 第三个来源。上面那条是「面板送出去的 == 面板读回来的」，两端都在被测链路里；
    // 这里由 e2e 自己算出同一份载荷去比盘上的文件，链路整体的一致性偏差才无处可藏。
    expect(readFileSync(join(storageRoot, BYTES_FILE))).toEqual(payloadBytes());
    expect(statSync(join(storageRoot, EMPTY_FILE)).size, '零字节上传该建出一个 0 字节的文件').toBe(0);
  });

  /**
   * AC#10 的取消半边：取消的上传不留半写文件，也不留临时产物。
   *
   * @remarks
   * 驱动先送了一块**真实字节**再取消——「什么都没写就取消」证不了半写文件被清掉，
   * 它只证明了没开始过。
   *
   * 两条证据分工不同：
   *
   * - `cancelledFile` 是驱动**经 wire** 去下载那个路径拿到的码，取消之后立刻问的；
   * - 盘上的两条由 e2e 自己看：目标文件不在，且父目录里没有 host 的 `.rxdb-tmp` 残留。
   *
   * 临时产物那条必须由驱动在**进程还活着的时候**数一遍（`tempResidue`）：自检一上报
   * Rust 就 `app.exit`，而驱动在一个进程里会跑两代，第二代随时可能被这次退出打断，
   * 它留下的 `.rxdb-tmp` 与「取消没清干净」在盘上长得一模一样。
   */
  it('取消的上传不留半写文件，也不留孤儿临时产物', () => {
    const native = nativeOf(run);

    expect(native.cancelledUpload, wire(run)).toBe('ok');
    expect(native.cancelledFile, '取消之后那个路径居然下载得到').toBe('resource_not_found');
    expect(native.tempResidue, '取消之后 host 还留着未提交的临时文件').toBe(0);
    expect(existsSync(join(storageRoot, CANCELLED_FILE)), '取消的上传落了一个半写文件').toBe(false);
  });

  it('越界路径的上传在 provider 就被拒，插件根之外什么都没落', () => {
    // `path: '..'` 走的是共享包的 `parseLogicalPath`，它整条拒掉相对记号而不是就地解析。
    // 与写入授权无关：这一跑开着 `full` + `allow`，拒绝只可能来自路径校验本身。
    expect(nativeOf(run).escapedUpload, wire(run)).toBe('invalid_path');
    expect(existsSync(join(storageRoot, '..', BYTES_FILE)), '字节落到了插件根之外').toBe(false);
  });

  it('只读那一跑的其余结论在这一跑同样成立', () => {
    const native = run.report.devtools?.native;

    // 授权档只该影响写入。settings 的两条拒绝与伪造 session 的拒绝都与档位无关，
    // 这里复核一遍：否则「开了 full 就什么都能干」这种回归不会被任何用例接住。
    expect(native?.settingsExport).toBe('export_unsupported');
    expect(native?.settingsClear).toBe('provider_unsupported');
    expect(native?.forgedSession).toBe('session_invalid');
  });
});

/** 授权档的三个环境变量；两次启动逐字相同，差别只在「第几次跑」。 */
const AUTHORIZED_ENV: Readonly<Record<string, string>> = Object.freeze({
  DEV_RXDB_DEVTOOLS: '1',
  DEV_RXDB_DEVTOOLS_CAPABILITY: 'full',
  DEV_RXDB_DEVTOOLS_MUTATION: 'allow'
});

/** 把整份 wire 结论带进断言消息：单看一个 `undefined` 分不出「没跑」还是「跑了没通」。 */
const wire = (run: SelfCheckRun): string => `native=${JSON.stringify(run.report.devtools?.native)}\n${because(run)}`;

/** 读出 wire 结论并当场钉死它存在——后面每条断言都建立在它上面。 */
const nativeOf = (run: SelfCheckRun): DevToolsNativeProbe => {
  const native = run.report.devtools?.native;
  expect(native, `这一跑的调试窗口里没有 wire 结论：${wire(run)}`).toBeDefined();
  return native as DevToolsNativeProbe;
};

/**
 * 跨重启比对（US-905 阶段 2，AC#15）。
 *
 * @remarks
 * # 判据为什么必须经 wire 取，而不是 e2e 自己去看磁盘
 *
 * 「重启之后面板还能读到上一次的数据」这句话里，**读的那一方是面板**。e2e 直接 `existsSync`
 * 一下只能证明数据还在盘上——那是 US-505 早就证过的事，与 DevTools 链路无关。这里要的是
 * 调试窗口里的驱动经 `invoke` → Rust 中继 → connector → 真实 native host 拿回来的观察。
 *
 * 两条独立证据各覆盖一个领域：
 *
 * - **`files` 领域**：`keptDirSeen` —— 驱动**动手之前**的第一条 `files.list` 里有没有它上一次
 *   留下的目录。第一跑必须是 `false`，第二跑必须是 `true`。
 * - **`database` 领域**：`launchRowCount` —— 经 wire 数出来的启动记录行数。它跨进程只增不减，
 *   而一个内存实现或每次重建的空库在第二跑里只会数到本进程刚写的那一两行。
 *
 * # 为什么读的是「第一遍」驱动的结论
 *
 * 一个进程里驱动会跑**两遍**（探针为了 AC#4 把调试窗口关掉再以同 label 重开，重开的那扇窗
 * 带着同一份注入脚本）。第二遍看到的世界已经被第一遍改过：`keptDirSeen` 在它眼里恒为 `true`，
 * 「上一次留下的」与「本进程刚建的」完全同形。观察者因此只留**第一条**结论
 * （`devtools-probe.ts` 的 `waitForNative`），它的前置条件才是已知的。
 *
 * # 行数的上下界是怎么来的
 *
 * 探针开着时一个进程会 bootstrap **两次**（AC#5 那次 `location.reload()`），每次追加一行。
 * 而两遍驱动都跑在刷新**之前**，所以第一跑经 wire 数到的行数不会超过 1；第二跑起步时盘上
 * 已经有第一跑的两行，因此至少是 2。断言取这两个界而不是等值：具体数字取决于驱动的查询与
 * 应用的写入谁先落地，而那是个真实的竞态，钉死等值只会换来一条间歇红。
 *
 * ⚠️ 与本文件其余两个 describe 一样依赖 dev 产物，见文件头注。
 */
describe('跨重启的 wire 比对（US-905 阶段 2，AC#15）', () => {
  /**
   * 两次启动放在**同一条**用例里，理由与 `desktop-persistence.spec.ts` 同源：
   * 拆成 `beforeAll` + 多条 `it` 的话，一次重试会重启 worker、把「这是第几次启动」
   * 变成重试次数的函数，而「第一次没有、第二次有」正是这条 AC 的全部内容。
   */
  it('第二次启动时，面板经真实 wire 看得见第一次留下的目录与数据', async () => {
    const frontend = await serveFrontend();
    const workspace = mkdtempSync(join(realpathSync(tmpdir()), 'rxdb-tauri-devtools-restart-'));
    const dataDir = join(workspace, 'app-data');
    mkdirSync(dataDir);
    const storageRoot = join(dataDir, 'rxdb-files', 'files');

    try {
      // 报告路径每次换一个：复用同一条路径的话，第二次若崩在写报告之前，读回来的是第一次
      // 那份——于是「第二次看不见上一次的数据」这个结论完全是假的。
      const first = await runSelfCheck({
        dataDir,
        reportPath: join(workspace, 'selfcheck-restart-1.json'),
        devtoolsProbe: true,
        profile: 'debug',
        env: AUTHORIZED_ENV
      });
      expect(first.report.status, because(first)).toBe('ok');
      const before = nativeOf(first);

      // 先钉住这次观察**是一次成功的观察**：驱动读不到存储根时也会给出 `keptDirSeen: false`
      // （空列表里当然找不到那个名字），于是「没看见」与「根本没看成」同形。少了这一条，
      // 一个从来读不通的链路也能把下面那条负对照骗绿。
      expect(before.filesList, wire(first)).toBe('ok');
      // 第一跑：驱动动手之前盘上是空的。这一条同时是第二跑那条断言的负对照——
      // 没有它，`keptDirSeen` 恒为 `true` 的实现（比如把这个字段写死）也能全绿。
      expect(before.keptDirSeen, `第一跑就看见了 ${KEPT_DIR}：${wire(first)}`).toBe(false);
      // 数据面：`database.query` 在真实链路上答得出来（AC#9），且数到的行数还在本进程范围内。
      expect(before.databaseQuery, wire(first)).toBe('ok');
      expect(before.launchRowCount ?? -1, wire(first)).toBeLessThanOrEqual(1);

      // 独立于 wire 的一条磁盘事实：第一跑确实把那个目录留下了。缺了它，第二跑的
      // `keptDirSeen: true` 就只是「面板说它看见了」，没有第二个来源佐证。
      expect(existsSync(join(storageRoot, KEPT_DIR)), '第一跑没有把目录留在盘上').toBe(true);

      const second = await runSelfCheck({
        dataDir,
        reportPath: join(workspace, 'selfcheck-restart-2.json'),
        devtoolsProbe: true,
        profile: 'debug',
        env: AUTHORIZED_ENV
      });
      expect(second.report.status, because(second)).toBe('ok');
      const after = nativeOf(second);

      // AC#15 的 `files` 一半：换了个进程，面板在自己动手之前就看见了上一次的产物。
      expect(after.keptDirSeen, `第二跑没看见 ${KEPT_DIR}：${wire(second)}`).toBe(true);

      // AC#15 的 `database` 一半：第二跑经 wire 数到的行数，覆盖得住第一跑结算时应用侧
      // 自己数出来的总数。两个数字来自**两条独立路径**——一条是页内 repository，
      // 一条是面板经 IPC → 中继 → provider——所以相符只可能是因为它们看的是同一个真实的库。
      expect(after.databaseQuery, wire(second)).toBe('ok');
      expect(after.launchRowCount ?? -1, wire(second)).toBeGreaterThanOrEqual(first.report.launchCount ?? 0);

      // 应用侧的同一句话，作为上面那条比对的参照系：它单独看只是 US-505 的持久化，
      // 与面板无关；两条一起才说明面板读的不是某个替身。
      expect(second.report.launchCount ?? 0).toBeGreaterThan(first.report.launchCount ?? 0);
    } finally {
      await frontend.close();
      rmSync(workspace, { force: true, recursive: true });
    }
  }, 420_000);
});
