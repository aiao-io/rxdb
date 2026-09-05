// @ts-check
/**
 * US-905 阶段 2：调试窗口里的 dev-only wire 驱动。
 *
 * # 它是什么
 *
 * 一段**只存在于 dev 二进制里**的脚本（`include_str!` + `#[cfg(dev)]`），由
 * `open_devtools_window` 在自检探针开启时经 `initialization_script` 装进 `rxdb-devtools` 窗口。
 * release 产物里连这些字节都没有——这比 Electron 侧「产物在、只是没人加载」的隔离更强。
 *
 * # 为什么必须在这个窗口里
 *
 * Rust 中继按**发起窗口 label** 路由：主窗口发出的帧一律送到调试窗口。所以一条要让
 * connector 回答的 `REQUEST`，只能从调试窗口发出——主窗口自己发是发给面板的。
 * 而应答同样只回到调试窗口，所以「读到答案」也只能在这里做。
 *
 * # 为什么是「自己跑完一遍」而不是被远程逐步驱动
 *
 * 被远程驱动要在这里再开一条控制通道（listen 一个 drive 事件、逐条回结果），
 * 而本轮要验的五件事是固定的。固定脚本因此只需要两样东西：一个入站帧监听、一次出站汇报。
 * 动作集要扩大时再谈控制通道（AC#10 的 DOM 操作、AC#15 的重启比对属于 C4）。
 *
 * # 为什么直接用 `__TAURI_INTERNALS__`
 *
 * 初始化脚本在**页面脚本之前**执行，那时没有模块系统、也没有 `@tauri-apps/api`。
 * 内部 API 的形状照抄 `@tauri-apps/api/event` 与 `webviewWindow`（listen 的 target 取
 * `{ kind: 'Webview', label }`，与面板 transport 用的 `getCurrentWebviewWindow().listen` 同一种）：
 * 阶段 1 的发现 2 已经踩过——`{ kind: 'Any' }` 会无视定向投递收到所有帧。
 *
 * # 它不放宽任何东西
 *
 * 用的全是这个窗口**本来就有**的能力：`core:event:default` 的 listen/emit_to，以及
 * 应用自有命令 `devtools_message`（面板 transport 自己也在调它）。不新增 capability、
 * 不新增 Rust 命令，也不碰 connector 的授权判定——发出去的 `REQUEST` 照样受
 * capability / descriptor / mutation policy 三层约束，这正是 AC#13 想看到的。
 */
(function () {
  'use strict';

  const DEVTOOLS_LABEL = 'rxdb-devtools';
  const MAIN_LABEL = 'main';
  const MESSAGE_EVENT = 'devtools:message';
  const RESULT_EVENT = 'devtools:drive-result';
  const SOURCE = '@aiao/rxdb-devtools';
  const PROTOCOL_V2 = 2;
  /** 从收到握手到发出汇报的总预算；超时也要汇报，空着回去会让 e2e 只看到一个超时。 */
  const BUDGET_MS = 15000;
  /** 单条请求的等待上限。 */
  const ANSWER_TIMEOUT_MS = 4000;
  /** 写入用例留在盘上的目录名；e2e 独立去磁盘上核对它在不在。 */
  const KEPT_DIR = 'drv-kept';
  /** 建了就删的目录名，用来走一遍 delete。 */
  const TEMP_DIR = 'drv-temp';
  /**
   * 跨重启比对用的实体名（AC#15），与 `src/app/desktop-launch.entity.ts` 的 `@Entity({ name })` 一致。
   *
   * 每次启动追加一行，所以行数**跨进程**递增——内存实现与空库都无从伪装。
   */
  const LAUNCH_ENTITY = 'DesktopLaunch';

  const internals = window.__TAURI_INTERNALS__;
  if (!internals || !internals.invoke) return;
  const label = internals.metadata && internals.metadata.currentWebview && internals.metadata.currentWebview.label;
  if (label !== DEVTOOLS_LABEL) return;

  /** @type {string|null} 本次会话；由面板收到的 HANDSHAKE_ACK 给出。 */
  let sessionId = null;
  /** @type {Map<string, (frame: any) => void>} requestId → 等待者。 */
  const waiters = new Map();
  /**
   * 最近一条 session 级 ERROR 的错误码。
   *
   * @remarks
   * 协议里 `requestId === null` 的 ERROR **不归属任何请求**（session 级），所以它落不进
   * `waiters`。不单独记的话，「被按 session 拒了」在驱动这一侧只表现为一次超时——
   * 而超时与「对端没答」不可区分，那正是 AC#13 不能用弱证据结账的地方。
   */
  let lastSessionError = null;
  let sequence = 1000;

  function invoke(command, payload) {
    return internals.invoke(command, payload);
  }

  function emitToMain(payload) {
    return invoke('plugin:event|emit_to', {
      target: { kind: 'AnyLabel', label: MAIN_LABEL },
      event: RESULT_EVENT,
      payload: payload
    });
  }

  /** 入站帧：记下 session，并把应答交给等待者。 */
  function onFrame(event) {
    let frame;
    try {
      frame = JSON.parse(event.payload);
    } catch {
      return;
    }
    if (!frame || frame.source !== SOURCE || frame.protocol !== PROTOCOL_V2) return;
    // session 取**信封**上的 `sessionId`，而不是等某一种帧。
    //
    // 这里踩过一次：原本等的是 `HANDSHAKE_ACK`，但那一帧的方向是 **panel → connector**
    // （connector 铸 session，面板只回显）——它根本不会投递到这个窗口，于是驱动稳定地
    // 等满预算、报一句 `sessionSeen: false`，而主窗口那边 `handshakeCompleted` 明明是 true。
    // 协商完成后每一帧都带着 session，取信封因此既准确又不依赖某一种帧先到。
    if (sessionId === null && typeof frame.sessionId === 'string') sessionId = frame.sessionId;
    if (frame.type !== 'RESPONSE' && frame.type !== 'ERROR') return;
    if (frame.type === 'ERROR' && frame.payload && frame.payload.requestId === null) {
      lastSessionError = frame.payload.error && frame.payload.error.code;
      return;
    }
    const requestId = frame.payload && frame.payload.requestId;
    const waiter = requestId === undefined ? undefined : waiters.get(requestId);
    if (waiter) {
      waiters.delete(requestId);
      waiter(frame);
    }
  }

  /**
   * 发一条 v2 `REQUEST` 并等它的应答。
   *
   * 帧由这里现拼：驱动**不导入**共享包（初始化脚本里没有模块系统），所以形状与
   * `createDevToolsV2Message` 逐字对齐，任一字段写错都会被 connector 的外层校验拒掉——
   * 那正是这条链路要验的东西之一。
   */
  function request(domain, operation, params) {
    const requestId = 'drv-' + domain + '-' + operation + '-' + sequence;
    const frame = {
      source: SOURCE,
      protocol: PROTOCOL_V2,
      direction: 'panel-to-connector',
      type: 'REQUEST',
      sessionId: sessionId,
      payload: { requestId: requestId, domain: domain, operation: operation, params: params },
      timestamp: Date.now(),
      sequence: sequence++
    };
    return new Promise(function (settle) {
      const timer = setTimeout(function () {
        waiters.delete(requestId);
        settle({ outcome: 'timeout' });
      }, ANSWER_TIMEOUT_MS);
      waiters.set(requestId, function (answer) {
        clearTimeout(timer);
        if (answer.type === 'RESPONSE') settle({ outcome: 'ok', result: answer.payload.result });
        else settle({ outcome: 'failed', code: answer.payload.error && answer.payload.error.code });
      });
      invoke('devtools_message', { payload: JSON.stringify(frame) }).catch(function (error) {
        clearTimeout(timer);
        waiters.delete(requestId);
        settle({ outcome: 'relay_rejected', message: String(error) });
      });
    });
  }

  /** 把一次结果压成 e2e 能直接断言的扁平形状；不回显路径与字节。 */
  function codeOf(answer) {
    return answer.outcome === 'ok' ? 'ok' : (answer.code ?? answer.outcome);
  }

  /** 一次 `files.list` 的条目数组；没读到结果时是空数组。 */
  function entriesOf(answer) {
    return answer.outcome === 'ok' && answer.result && answer.result.entries ? answer.result.entries : [];
  }

  async function run() {
    // AC#9 / AC#10：三个领域的 descriptor 由 connector 在 HANDSHAKE_ACK 之后随
    // `DESCRIPTORS` 帧给面板；这里不重复读它——runtime 的判据在页内单测与面板 UI 上，
    // 驱动只验「真实链路上这些操作答什么」。
    //
    // 这条必须是**第一件事**：`keptDirSeen` 的全部意义在于「本进程还没碰过存储时，
    // 盘上就已经有它了」，任何一次写入排在它前面都会把 AC#15 的判别力抹掉。
    const files = await request('files', 'list', { path: '' });
    const keptDirSeen = entriesOf(files).some(function (entry) {
      return entry && entry.name === KEPT_DIR;
    });
    // AC#9 的数据面一半：面板经真实 wire 读同一个库里的实体。只回**行数**不回文档——
    // AC#13 明写响应不得含 SQL 绑定值与加密字段，而行数已经足够跨重启比对。
    const launches = await request('database', 'query', { entityName: LAUNCH_ENTITY });
    const settingsExport = await request('settings', 'export', { path: 'db/main.sqlite' });
    // 未声明的能力：descriptor 层就该拒，走不到 provider（AC#12）。
    const settingsClear = await request('settings', 'clear', {});
    // 伪造 session：connector 必须按 session 拒，而不是照答（AC#13）。
    // 写入两条（AC#10 / #13 的写入半边）：一条**留在盘上**给 e2e 独立核对，一条随手删掉、
    // 顺带把 delete 也走一遍。只读档下两条都会被拒，而拒绝码与「操作没声明」相同——
    // 判别力因此落在磁盘上，不在码上。
    //
    // 先删一次再建：**一个进程里这段脚本会跑不止一遍**——探针为了 AC#4 会把调试窗口
    // 关掉再以同 label 重开，而重开的那扇窗又带着这份驱动。第二遍撞上自己第一遍留下的
    // 目录，`create-directory` 会答 `resource_conflict`（实测）。
    //
    // 修法取「让准备步骤幂等」而不是「把 conflict 也算通过」：后者会让一次**真实的**
    // 冲突缺陷从这条用例底下溜过去。删除的结果刻意不看——只读档下它本来就会被拒。
    await request('files', 'delete', { path: KEPT_DIR });
    const createdKept = await request('files', 'create-directory', { path: KEPT_DIR });
    const createdTemp = await request('files', 'create-directory', { path: TEMP_DIR });
    const deleted = createdTemp.outcome === 'ok' ? await request('files', 'delete', { path: TEMP_DIR }) : createdTemp;

    const realSession = sessionId;
    sessionId = '00000000-0000-4000-8000-000000000000';
    lastSessionError = null;
    const forged = await request('files', 'list', { path: '' });
    sessionId = realSession;
    // 拒绝以 session 级 ERROR 的形式回来（`requestId: null`），所以那条请求自己等到的是超时。
    // 优先报那个码：它说明「被拒了」，而超时只说明「没答」。
    const forgedCode = forged.outcome === 'timeout' && lastSessionError ? lastSessionError : codeOf(forged);

    return {
      sessionSeen: realSession !== null,
      filesList: codeOf(files),
      filesEntryCount: files.outcome === 'ok' ? entriesOf(files).length : -1,
      keptDirSeen: keptDirSeen,
      databaseQuery: codeOf(launches),
      launchRowCount:
        launches.outcome === 'ok' && launches.result ? (launches.result.documents || []).length : -1,
      settingsExport: codeOf(settingsExport),
      settingsClear: codeOf(settingsClear),
      forgedSession: forgedCode,
      createDirectory: codeOf(createdKept),
      deleteEntry: codeOf(deleted)
    };
  }

  // 逐阶段打点：这条链路上任何一步失败都表现为「主窗口什么都没收到」，而
  // 「脚本没注入」「listen 没通」「没等到握手」三种成因的修法完全不同。
  // 打点走 `failure` 字段、后到的覆盖先到的，所以跑通时最终结论里它是 `null`。
  function beacon(stage) {
    void emitToMain({ sessionSeen: false, failure: 'stage:' + stage });
  }

  beacon('booted');

  // 监听要在最早时刻装好：HANDSHAKE_ACK 只发一次，晚一步就永远拿不到 session。
  invoke('plugin:event|listen', {
    event: MESSAGE_EVENT,
    target: { kind: 'Webview', label: DEVTOOLS_LABEL },
    handler: internals.transformCallback(onFrame)
  })['catch'](function (error) {
    beacon('listen-failed:' + String(error));
    throw error;
  }).then(function () {
    beacon('listening');
    const started = Date.now();
    // `const` 而不是 `let`：回调里要引用它自己来 `clearInterval`，而 TDZ 只在**求值时刻**
    // 生效——回调最早也要等到第一个 tick 才跑，那时绑定早已完成。
    const tick = setInterval(function () {
      if (sessionId === null) {
        if (Date.now() - started < BUDGET_MS) return;
        clearInterval(tick);
        // 汇报「没等到握手」而不是静默：空着回去与「驱动根本没装上」在 e2e 上不可区分。
        void emitToMain({ sessionSeen: false });
        return;
      }
      clearInterval(tick);
      beacon('session-seen');
      run().then(emitToMain, function (error) {
        void emitToMain({ sessionSeen: true, failure: String(error) });
      });
    }, 50);
  });
})();
