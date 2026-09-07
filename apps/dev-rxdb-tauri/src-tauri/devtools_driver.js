// @ts-check
/* eslint-disable @typescript-eslint/no-unused-vars, prefer-const --
 * dev-only 驱动脚本：常量和计数器按阶段分批落地（AC#10 字节面、传输记账等尚未接进 run() 的
 * 半成品），lint 不应把它们当死代码报；`let` 预留给后续阶段做累加。 */
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
 * 而要验的这几件事是固定的。固定脚本因此只需要两样东西：一个入站帧监听、一次出站汇报。
 *
 * AC#15 的跨重启比对也不需要控制通道：两次启动跑的是**同一份**脚本，差别全在盘上——
 * 驱动只要在动手之前先看一眼世界（`keptDirSeen` / `launchRowCount`），比对由 e2e 去做。
 * AC#10 的字节面同样是固定动作（上传 → 读回 → 逐字节比），也不需要。
 * 真要控制通道的是 AC#10 剩下的那一半：面板 UI 得显示 `runtime: tauri`，而那要驱动**面板的
 * DOM**，不是驱动 wire。
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
  /**
   * 等存储根出现的上限。
   *
   * 这是**启动竞态的宽限**，不是请求超时（那个是 `ANSWER_TIMEOUT_MS`）：host 每次都答得很快，
   * 只是答「还没有」。见 {@link listRootWhenReady}。
   */
  const ROOT_READY_TIMEOUT_MS = 8000;
  /** 等一次已发出的提交落到盘上的上限；同样是宽限而不是请求超时。 */
  const COMMIT_READY_TIMEOUT_MS = 4000;
  /** 等 host 的临时产物出现 / 清干净的上限。 */
  const TEMP_SETTLE_TIMEOUT_MS = 4000;
  /** 两次重试之间的间隔。 */
  const RETRY_POLL_MS = 100;
  /** 「还不在盘上」的错误码，与 Rust 侧 `ErrorCode::ResourceNotFound` 的线上形态一致。 */
  const MISSING_CODE = 'resource_not_found';
  /** 写入用例留在盘上的目录名；e2e 独立去磁盘上核对它在不在。 */
  const KEPT_DIR = 'drv-kept';
  /** 建了就删的目录名，用来走一遍 delete。 */
  const TEMP_DIR = 'drv-temp';
  /** 字节往返的目标名；三个各管一件事，e2e 分别到盘上核对。 */
  const BYTES_FILE = 'drv-bytes.bin';
  /** 零字节上传的目标名（AC#10 的边界用例）。 */
  const EMPTY_FILE = 'drv-empty.bin';
  /** 送了一块真实字节之后取消的那次上传的目标名；它**不该**出现在盘上。 */
  const CANCELLED_FILE = 'drv-cancelled.bin';
  /**
   * host 未提交写入留在盘上的临时文件后缀。
   *
   * 与 Rust 侧 `write_begin` 的 `.{write_id}.rxdb-tmp` 一致，且 `list_path` 不过滤点开头的
   * 名字、`decodePhysicalName` 对它是恒等映射——所以经 `files.list` 就能把它数出来。
   */
  const TEMP_SUFFIX = '.rxdb-tmp';
  /** 往返载荷的字节数。 */
  const PAYLOAD_BYTES = 700;
  /**
   * 驱动自己的分块大小。
   *
   * AC#10 要的是「全程流式」，而一帧装完全部载荷同样能让字节对上——那正是流式没接通的形态。
   * 700 / 256 因此恒为 3 帧，e2e 直接钉这个数。协议只要求 1 ≤ 块长 ≤ 256 KiB，选小的那头
   * 是为了不把几百 KB 的 base64 推过 Tauri IPC。
   */
  const CHUNK_BYTES = 256;
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
  /** 传输 id 的计数器；与 `sequence` 分开，读日志时一眼能分出「第几条传输」。 */
  let transfers = 0;
  /**
   * 等待者结算之后才到的 ERROR，按 requestId 记。
   *
   * @remarks
   * 上传的失败**挂在上传那条 REQUEST 的 requestId 上**（端点里 `#onTransferChunk` /
   * `#settleTransferFrame` 都用它归因），可那个 requestId 早在 RESPONSE 到达时就被结算掉了。
   * 不单独记的话，一次被拒的传输在驱动这侧完全静默——与一次成功的上传同形，
   * 而成功的上传在 wire 上本来就是静默的。
   */
  const strayErrors = new Map();
  /** @type {Map<string, {chunks: Uint8Array[], settle: (code: string) => void}>} 下载的 requestId → 字节收集器。 */
  const pendingDownloads = new Map();
  /** @type {Map<string, string>} 入站 transferId → 它属于哪条下载。 */
  const inboundTransfers = new Map();

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
    if (!frame.payload) return;
    if (onTransferFrame(frame)) return;
    if (frame.type !== 'RESPONSE' && frame.type !== 'ERROR') return;
    if (frame.type === 'ERROR' && frame.payload.requestId === null) {
      lastSessionError = frame.payload.error && frame.payload.error.code;
      return;
    }
    const requestId = frame.payload.requestId;
    const waiter = requestId === undefined ? undefined : waiters.get(requestId);
    if (waiter) {
      waiters.delete(requestId);
      waiter(frame);
      return;
    }
    if (frame.type === 'ERROR' && typeof requestId === 'string') {
      strayErrors.set(requestId, frame.payload.error && frame.payload.error.code);
    }
  }

  /**
   * 入站的 `TRANSFER_*` 帧，也就是下载方向的字节。
   *
   * @param frame - 一条信封已通过检查的帧。
   * @returns 这一帧归传输层管时为 `true`。
   *
   * @remarks
   * **`TRANSFER_START` 早于这次下载的 `RESPONSE` 到达**——那条顺序是协议的一部分
   * （端点 `#beginDownload` 上的 TSDoc 写明了为什么）。所以收集器必须在**发出请求之前**
   * 就登记好，等 RESPONSE 回来再登记的话 START 来时无处可挂，字节会被整段丢掉。
   */
  function onTransferFrame(frame) {
    const payload = frame.payload;
    if (frame.type === 'TRANSFER_START') {
      if (pendingDownloads.has(payload.requestId)) inboundTransfers.set(payload.transferId, payload.requestId);
      return true;
    }
    if (frame.type === 'TRANSFER_CHUNK') {
      const pending = pendingOf(payload.transferId);
      if (pending) pending.chunks.push(fromBase64(payload.dataBase64));
      return true;
    }
    if (frame.type !== 'TRANSFER_COMPLETE' && frame.type !== 'TRANSFER_CANCEL') return false;
    const settling = pendingOf(payload.transferId);
    inboundTransfers.delete(payload.transferId);
    // CANCEL 是端点读不下去时的收尾（它同时发一条 ERROR 给出归因），不是一次正常终态。
    if (settling) settling.settle(frame.type === 'TRANSFER_COMPLETE' ? 'ok' : 'transfer_cancelled');
    return true;
  }

  /** 一条入站传输对应的收集器。 */
  function pendingOf(transferId) {
    const requestId = inboundTransfers.get(transferId);
    return requestId === undefined ? undefined : pendingDownloads.get(requestId);
  }

  /**
   * 现拼一条 v2 信封。
   *
   * 帧由这里现拼：驱动**不导入**共享包（初始化脚本里没有模块系统），所以形状与
   * `createDevToolsV2Message` 逐字对齐，任一字段写错都会被 connector 的外层校验拒掉——
   * 那正是这条链路要验的东西之一。
   */
  function envelope(type, payload) {
    return {
      source: SOURCE,
      protocol: PROTOCOL_V2,
      direction: 'panel-to-connector',
      type: type,
      sessionId: sessionId,
      payload: payload,
      timestamp: Date.now(),
      sequence: sequence++
    };
  }

  /**
   * 发一条不等应答的帧（`TRANSFER_*` 三类）。
   *
   * @param type - 帧类型。
   * @param payload - 该类型的载荷。
   * @returns 中继受理这一帧的 promise。
   *
   * @remarks
   * 传输帧不按 requestId 结算，所以这里没有等待者：**成功的上传在 wire 上是静默的**
   * （见 `panel-endpoint.ts` 头注第 2 条），失败才回一条挂在上传 requestId 上的 ERROR，
   * 由 {@link strayErrors} 接住。
   *
   * 逐帧 `await`：CHUNK 的 `chunkIndex` / `offset` 必须严格递进，而顺序只有在
   * 「上一条已经交给中继」之后才有保证。
   */
  function sendFrame(type, payload) {
    return invoke('devtools_message', { payload: JSON.stringify(envelope(type, payload)) });
  }

  /** 发一条 `REQUEST` 并等它的应答；requestId 由本层现铸。 */
  function request(domain, operation, params) {
    return requestWith('drv-' + domain + '-' + operation + '-' + sequence, domain, operation, params);
  }

  /**
   * 同上，但由调用方指定 requestId。
   *
   * @remarks
   * `files.download` 需要它：那条请求的 `params.requestId` 必须与信封里的 requestId 相同
   * （provider 用它登记字节来源，端点随后按同一个键去取），而随后到达的 `TRANSFER_START`
   * 也用它认领——三处是同一个值，调用方因此必须先知道它是什么。
   */
  function requestWith(requestId, domain, operation, params) {
    const frame = envelope('REQUEST', {
      requestId: requestId,
      domain: domain,
      operation: operation,
      params: params
    });
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

  /** 到点即 resolve 的计时器。 */
  function delay(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  /**
   * 往返用的载荷。
   *
   * @returns {Uint8Array} `PAYLOAD_BYTES` 个字节。
   *
   * @remarks
   * 生成式而不是一串常量：e2e 那侧用**同一条公式**独立算一遍，再拿去比盘上的文件。
   * 两边都写死同一串字面量的话，抄错了也照样对得上——那样的比对没有判别力。
   */
  function payloadBytes() {
    const bytes = new Uint8Array(PAYLOAD_BYTES);
    for (let index = 0; index < bytes.length; index += 1) bytes[index] = (index * 31 + 7) & 0xff;
    return bytes;
  }

  /**
   * 按 RFC 4648 标准表编码。
   *
   * @remarks
   * `btoa` 的输出恰好是共享包 `decodeCanonicalBase64` 认的那一种：标准字母表、规范补位。
   * 它不认的（URL-safe 字母表、多余空白、非规范补位）`btoa` 也不会产出。
   */
  function toBase64(bytes) {
    let binary = '';
    for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index]);
    return btoa(binary);
  }

  /** 解 connector 送来的规范 base64。 */
  function fromBase64(text) {
    const binary = atob(text);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  }

  /** 把收到的若干块拼成一整段。 */
  function concatBytes(chunks) {
    let total = 0;
    for (const chunk of chunks) total += chunk.length;
    const joined = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      joined.set(chunk, offset);
      offset += chunk.length;
    }
    return joined;
  }

  /** 逐字节相同。 */
  function sameBytes(left, right) {
    if (left.length !== right.length) return false;
    for (let index = 0; index < left.length; index += 1) {
      if (left[index] !== right[index]) return false;
    }
    return true;
  }

  /**
   * 重复一件事，直到它不再答「还不在」。
   *
   * @param attempt - 每次要做的事。
   * @param codeFor - 从它的结果里取错误码。
   * @param timeoutMs - 总预算。
   * @returns 最后一次结果，等到了就是那一次的。
   *
   * @remarks
   * 只对 {@link MISSING_CODE} 这**一个**码重试：它说的是「还没到」，与 `permission_denied` /
   * `provider_unsupported` 这类**判定结果**完全不同——后者重试多少次都该是同一个答案，
   * 对它们重试等于把一次真实的拒绝拖成超时。等满预算就照实把那个码报回去，什么也不掩盖。
   */
  async function retryWhileMissing(attempt, codeFor, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    let answer = await attempt();
    while (codeFor(answer) === MISSING_CODE && Date.now() < deadline) {
      await delay(RETRY_POLL_MS);
      answer = await attempt();
    }
    return answer;
  }

  /** 列一次存储根。 */
  function listRoot() {
    return request('files', 'list', { path: '' });
  }

  /**
   * 列一次存储根，必要时等它先被建出来。
   *
   * @returns 一次 `files.list` 的应答。
   *
   * @remarks
   * **实测踩过**：存储根不是启动就在盘上的——它由应用自己那一步 storage probe 上传探针文件
   * 时建出来（`src/app/storage-probe.ts`），而这扇调试窗口是 Rust 在 `setup()` 里与主窗口
   * **一起**建的。驱动因此会早于应用完成初始化就问出第一条 list，答到 `resource_not_found`。
   *
   * 之前这个race被掩盖着：探针留的是第二遍驱动的结论，而第二遍跑在十秒之后，那时根早就有了。
   * 改成留第一遍之后它就浮出来了，两条只读档断言随即变红。
   */
  function listRootWhenReady() {
    return retryWhileMissing(listRoot, codeOf, ROOT_READY_TIMEOUT_MS);
  }

  /** 存储根里 host 尚未提交的临时文件数。 */
  async function countTemporaries() {
    return entriesOf(await listRoot()).filter(function (entry) {
      return entry && typeof entry.name === 'string' && entry.name.endsWith(TEMP_SUFFIX);
    }).length;
  }

  /**
   * 等存储根里冒出一个 host 的临时文件。
   *
   * @returns 在预算内等到时为 `true`。
   */
  async function temporaryAppeared() {
    const deadline = Date.now() + TEMP_SETTLE_TIMEOUT_MS;
    let count = await countTemporaries();
    while (count === 0 && Date.now() < deadline) {
      await delay(RETRY_POLL_MS);
      count = await countTemporaries();
    }
    return count > 0;
  }

  /**
   * 清点 host 的临时产物，必要时先等在途的提交落定。
   *
   * @returns 存储根里最终剩下的临时文件数。
   *
   * @remarks
   * 等而不是采一次样：`TRANSFER_COMPLETE` 在 wire 上没有回执，所以「上一次提交做完了没有」
   * 在驱动这一侧没有信号可等，采样点落在 host 那次 `rename` 之前是一条真实的竞态。
   *
   * 这不掩盖任何东西——**真的泄漏了的话它不会自己变成 0**，等满预算照样把非零的数报回去。
   */
  async function settledTemporaries() {
    const deadline = Date.now() + TEMP_SETTLE_TIMEOUT_MS;
    let count = await countTemporaries();
    while (count > 0 && Date.now() < deadline) {
      await delay(RETRY_POLL_MS);
      count = await countTemporaries();
    }
    return count;
  }

  /**
   * 起一次上传：`files.upload` 请求本身。
   *
   * @param path - 目标文件所在目录（相对插件根；`''` 即根）。
   * @param name - 目标文件名。
   * @param size - 打算送多少字节。
   * @returns 应答，以及这次传输三处共用的两个 id。
   */
  async function beginUpload(path, name, size) {
    const requestId = 'drv-files-upload-' + sequence;
    transfers += 1;
    const transferId = 'trf-' + transfers;
    const answer = await requestWith(requestId, 'files', 'upload', {
      transferId: transferId,
      path: path,
      name: name,
      size: size
    });
    return { answer: answer, requestId: requestId, transferId: transferId };
  }

  /**
   * `TRANSFER_START` 之后按 {@link CHUNK_BYTES} 切片推字节。
   *
   * @param begun - {@link beginUpload} 的结果。
   * @param bytes - 要送的字节。
   * @returns 实际发出的 `TRANSFER_CHUNK` 帧数；零字节载荷是 0 帧。
   */
  async function streamChunks(begun, bytes) {
    await sendFrame('TRANSFER_START', {
      transferId: begun.transferId,
      requestId: begun.requestId,
      totalBytes: bytes.length
    });
    let sent = 0;
    while (sent * CHUNK_BYTES < bytes.length) {
      const offset = sent * CHUNK_BYTES;
      await sendFrame('TRANSFER_CHUNK', {
        transferId: begun.transferId,
        chunkIndex: sent,
        offset: offset,
        dataBase64: toBase64(bytes.subarray(offset, Math.min(offset + CHUNK_BYTES, bytes.length)))
      });
      sent += 1;
    }
    return sent;
  }

  /**
   * 走完一次上传：请求 → START → CHUNK* → COMPLETE。
   *
   * @param path - 目标目录。
   * @param name - 目标文件名。
   * @param bytes - 要送的字节。
   * @returns `{ code, chunks, requestId }`；请求就被拒时 `chunks` 是 `-1`。
   *
   * @remarks
   * `code` 只到「帧已发出」为止——成功的上传在 wire 上是静默的。「确实提交了、且提交的正是
   * 那些字节」要靠把它读回来（{@link download}），以及 e2e 自己读盘。
   */
  async function upload(path, name, bytes) {
    const begun = await beginUpload(path, name, bytes.length);
    if (begun.answer.outcome !== 'ok') {
      return { code: codeOf(begun.answer), chunks: -1, requestId: begun.requestId };
    }
    const chunks = await streamChunks(begun, bytes);
    await sendFrame('TRANSFER_COMPLETE', { transferId: begun.transferId });
    return { code: 'ok', chunks: chunks, requestId: begun.requestId };
  }

  /** 传输发出之后才到的那条 ERROR 优先：它比「帧已发出」更靠后，也更有判别力。 */
  function transferCode(sent) {
    return strayErrors.get(sent.requestId) ?? sent.code;
  }

  /**
   * 送一块**真实字节**之后取消一次上传，并盯着 host 的临时产物走完一个来回。
   *
   * @param name - 目标文件名；它不该出现在盘上。
   * @param bytes - 取消之前先送出去的那一块。
   * @returns 结果码；只有「临时文件出现过、取消之后又没了」才是 `'ok'`。
   *
   * @remarks
   * # 为什么要先等临时文件出现
   *
   * `transfer.ts` 的 `cancel()` 与 `complete()` 不同——**它不等 `entry.writes`**。而
   * `deferredSink.discard()` 在句柄还没开出来时是空操作（`await opened?.discard()`）。
   * 于是「CHUNK 紧跟着 CANCEL」有一段真实的竞态：取消可能赶在 host 建出临时文件之前跑完，
   * 那次写入随后照样落地，留下一个再没人会去清的 `.rxdb-tmp`。
   *
   * 先等它**出现**把这段竞态消掉：临时文件既然已经在盘上，host 的 `write_begin` 就已经答过，
   * 而同一条 IPC 通道保序——那条应答一定早于我这次 `files.list` 的应答回到页面，
   * 也就早于我发出 CANCEL，`opened` 那时必然已经赋上了。
   *
   * # 为什么这比「发完就算」强
   *
   * 「帧发出去了」只说明面板尽了责。这里报的是**观察到的生命周期**：临时产物真的出现过
   * （字节确实落到了 host 上，不是一次空取消），取消之后它又真的没了。
   */
  async function cancelUpload(name, bytes) {
    const begun = await beginUpload('', name, bytes.length);
    if (begun.answer.outcome !== 'ok') return codeOf(begun.answer);

    await streamChunks(begun, bytes);
    if (!(await temporaryAppeared())) return 'no_temporary_file';
    await sendFrame('TRANSFER_CANCEL', { transferId: begun.transferId });
    return (await settledTemporaries()) === 0 ? 'ok' : 'temporary_leaked';
  }

  /**
   * 下载一个文件并把字节收齐。
   *
   * @param path - 相对插件根的逻辑路径。
   * @returns `{ code, bytes }`；`code` 不是 `'ok'` 时 `bytes` 是空的。
   */
  async function download(path) {
    const requestId = 'drv-files-download-' + sequence;
    const pending = { chunks: [], settle: function () {} };
    const streamed = new Promise(function (resolve) {
      pending.settle = resolve;
    });
    // START 早于 RESPONSE，所以登记必须先于请求（见 {@link onTransferFrame}）。
    pendingDownloads.set(requestId, pending);
    const answer = await requestWith(requestId, 'files', 'download', { path: path, requestId: requestId });
    if (answer.outcome !== 'ok') {
      pendingDownloads.delete(requestId);
      return { code: codeOf(answer), bytes: new Uint8Array(0) };
    }
    const expired = delay(ANSWER_TIMEOUT_MS).then(function () {
      return 'timeout';
    });
    const code = await Promise.race([streamed, expired]);
    pendingDownloads.delete(requestId);
    return { code: code, bytes: concatBytes(pending.chunks) };
  }

  async function run() {
    // AC#9 / AC#10：三个领域的 descriptor 由 connector 在 HANDSHAKE_ACK 之后随
    // `DESCRIPTORS` 帧给面板；这里不重复读它——runtime 的判据在页内单测与面板 UI 上，
    // 驱动只验「真实链路上这些操作答什么」。
    //
    // 这条必须是**第一件事**：`keptDirSeen` 的全部意义在于「本进程还没碰过存储时，
    // 盘上就已经有它了」，任何一次写入排在它前面都会把 AC#15 的判别力抹掉。
    const files = await listRootWhenReady();
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

    const bytes = await driveBytes();

    return {
      sessionSeen: realSession !== null,
      filesList: codeOf(files),
      filesEntryCount: files.outcome === 'ok' ? entriesOf(files).length : -1,
      keptDirSeen: keptDirSeen,
      databaseQuery: codeOf(launches),
      launchRowCount: launches.outcome === 'ok' && launches.result ? (launches.result.documents || []).length : -1,
      settingsExport: codeOf(settingsExport),
      settingsClear: codeOf(settingsClear),
      forgedSession: forgedCode,
      createDirectory: codeOf(createdKept),
      deleteEntry: codeOf(deleted),
      uploadBytes: bytes.uploadBytes,
      uploadChunks: bytes.uploadChunks,
      downloadBytes: bytes.downloadBytes,
      bytesMatch: bytes.bytesMatch,
      emptyUpload: bytes.emptyUpload,
      escapedUpload: bytes.escapedUpload,
      cancelledUpload: bytes.cancelledUpload,
      cancelledFile: bytes.cancelledFile,
      tempResidue: bytes.tempResidue
    };
  }

  /**
   * AC#10 的字节面：四次上传、两次下载，外加一次临时产物清点。
   *
   * @returns 报告里那九个字段。
   *
   * @remarks
   * # 落点全在存储根，不在 {@link KEPT_DIR} 里
   *
   * **一个进程里这份脚本会跑两遍**（探针为 AC#4 把调试窗口关掉再以同 label 重开），而
   * `KEPT_DIR` 会被第二遍的准备步骤整个删掉。字节产物放进去的话，第二遍随时可能把第一遍
   * 刚验过的文件连目录一起删走，e2e 读盘那两条就成了竞态。
   *
   * 放在根上则两遍互不干扰：host 的提交是「写临时文件 → `rename`」，覆盖是原子的，
   * 而两遍送的是同一份载荷。第二遍被 `app.exit` 打断在半路时，目标文件里留的仍是第一遍
   * 那份完整内容。
   *
   * # 取消为什么排在两次成功上传之前
   *
   * 它要盯着存储根里的 `.rxdb-tmp` 出现再消失，而并发的提交会在同一个目录里造出同后缀的
   * 临时产物——排在后面的话判据会被别人的临时文件污染。
   */
  async function driveBytes() {
    const payload = payloadBytes();
    const cancelled = await cancelUpload(CANCELLED_FILE, payload.subarray(0, CHUNK_BYTES));
    // 「没有半写文件」经 wire 取而不是 e2e 读盘：读盘只能证明这台机器上那个位置是空的，
    // 而 AC#10 问的是**面板看得到什么**。
    const cancelledFile = await download(CANCELLED_FILE);
    const empty = await upload('', EMPTY_FILE, new Uint8Array(0));
    const sent = await upload('', BYTES_FILE, payload);
    // `path: '..'` 整条被 `parseLogicalPath` 拒掉，走不到 provider 之外——所以它不发 START，
    // 也就不会在盘上留下任何东西。
    const escaped = await upload('..', BYTES_FILE, payload);
    // 上传没成立时不去读回来：只读档下那条下载注定 `resource_not_found`，重试只会白等满预算。
    const readBack =
      sent.code === 'ok' ?
        await retryWhileMissing(readBytesFile, codeOfDownload, COMMIT_READY_TIMEOUT_MS)
      : { code: sent.code, bytes: new Uint8Array(0) };

    return {
      uploadBytes: transferCode(sent),
      uploadChunks: sent.chunks,
      downloadBytes: readBack.code,
      bytesMatch: sameBytes(readBack.bytes, payload),
      emptyUpload: transferCode(empty),
      escapedUpload: escaped.code,
      cancelledUpload: cancelled,
      cancelledFile: cancelledFile.code,
      tempResidue: await settledTemporaries()
    };
  }

  /** 把刚上传的那个文件读回来。 */
  function readBytesFile() {
    return download(BYTES_FILE);
  }

  /** 一次 {@link download} 的结果码。 */
  function codeOfDownload(result) {
    return result.code;
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
  })
    ['catch'](function (error) {
      beacon('listen-failed:' + String(error));
      throw error;
    })
    .then(function () {
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
