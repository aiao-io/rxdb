/**
 * US-208 线 G：PGlite 事务 host **两案对照实验**（决策债，不是开发债）。
 *
 * 作为**真实 Electron 主进程**运行：
 *
 * ```
 * ELECTRON_RUN_AS_NODE= <electron> apps/dev-rxdb-electron/tools/pglite-tx-experiment/probe.mjs \
 *   <结果 JSON 输出路径>
 * ```
 *
 * 判定与红绿在 `apps/dev-rxdb-electron-e2e/src/pglite-tx-experiment.spec.ts` —— 本文件只负责
 * 「把两案各跑一遍并如实记录」。沿用阶段 A `devtools-mv3-probe.mjs` 的分工：探针不当自己的裁判。
 *
 * ## 被对照的到底是什么
 *
 * 故事「事务 host 方案二选一」列了两个候选，本实验把它们各实现一遍，跑**同一套**事务体
 * （`scenarios.mjs`，两案共用同一份源码），量六件事：
 *
 * 1. 一次事务内多次读写，且中途读得到自己未提交的写入（AC#2 正向）；
 * 2. 中途抛错后整条事务一行不落（AC#2 反向，「不得包装成假事务」）；
 * 3. bigint / bytea / jsonb / timestamptz 跨 `ipcRenderer.invoke` 逐值保真；
 * 4. PG 变更通知跨进程送达，且只送已提交的；
 * 5. 渲染进程崩在事务中途时会发生什么（AC#3）；
 * 6. 每条语句的 IPC 往返次数与耗时，以及协议接口面随用例增长的斜率。
 *
 * ## 三个必须守住的实验条件
 *
 * - **同一个 PGlite 实例**，两案共用。换实例的话第 6 项的耗时会混进两次 WASM 初始化。
 *   这同时顺带验了 AC#7「主进程单实例持有」是可行的。
 * - **真实 `dataDir`**（临时目录里的真目录），不是 `store: 'memory'`。落盘路径的开销与
 *   持久化语义都是本故事的正题。
 * - **真实的 preload 边界**：`contextIsolation: true` + `sandbox: true`，第 3 项量的
 *   structured clone 行为才与生产一致。
 *
 * ## 删得掉
 *
 * 本目录不被 `src-electron/` 的任何模块 import。删掉它与配套 spec，生产主进程一行不用改 ——
 * 与阶段 A 的探针同一条约束：实验代码不许在生产路径上留下运行时痕迹。
 *
 * @module pglite-tx-experiment/probe
 */

import { mkdtempSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { SCHEMA_SQL } from './scenarios.mjs';
import { createVariantAHost } from './variant-a-host.mjs';
import { createVariantBHost } from './variant-b-host.mjs';

const { app, BrowserWindow, ipcMain } = createRequire(import.meta.url)('electron');

// 位置参数要先剥掉所有 `--` 开头的项：只要在脚本路径之前插一个 Chromium 开关，
// `process.argv[2]` 就从输出路径变成脚本自身，报出来的错和真实原因毫无关系。
// （与阶段 A 探针同一个坑，见 devtools-mv3-probe.mjs 的注释。）
const positional = process.argv.slice(1).filter(arg => !arg.startsWith('--'));
const OUTPUT_PATH = positional[1];

if (!OUTPUT_PATH) {
  process.stderr.write('用法：<electron> probe.mjs <结果 JSON 路径>\n');
  process.exit(2);
}

const CHANNEL_A = 'pglite-tx-experiment:a';
const CHANNEL_B = 'pglite-tx-experiment:b';
const CHANNEL_EVENT = 'pglite-tx-experiment:event';
const NOTIFY_CHANNEL = 'tx_probe_changes';

const HERE = fileURLToPath(new URL('.', import.meta.url));

/** 观察到的事实。每项 `{ step, ok, detail }`，由 spec 侧逐项断言。 */
const findings = [];
const record = (step, ok, detail) => findings.push({ step, ok, detail });

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * 轮询等待条件成立。
 *
 * @param probe - 每次轮询求值的函数，返回真值即视为满足
 * @param timeoutMs - 上限；超时返回最后一次取值而不抛（超时本身是要记录的事实）
 */
const waitFor = async (probe, timeoutMs, intervalMs = 100) => {
  const deadline = Date.now() + timeoutMs;
  let value = await probe();
  while (!value && Date.now() < deadline) {
    await sleep(intervalMs);
    value = await probe();
  }
  return value;
};

app.on('window-all-closed', () => {
  // 刻意空实现：崩溃用例会销毁窗口，默认 handler 会立刻 quit，结果就来不及写盘。
  // 退出统一由 finish() 负责。
});

/** 主进程直接观察到的 PG 通知；与渲染进程侧的 `window.__events` 互为对照。 */
const notifiedInMain = [];

let dataDir = null;

const finish = code => {
  writeFileSync(OUTPUT_PATH, JSON.stringify(findings, null, 2));
  app.exit(code);
};

/**
 * 起一个实验窗口，注入事务体源码。
 *
 * @remarks
 * 事务体是把 `scenarios.mjs` 的**原文**剥掉 `export` 前缀后注入的 —— 方案 B 那侧是真的
 * `import` 同一个文件。两案跑的 SQL 因此逐字相同，耗时差只可能来自传输方式。
 */
const openWindow = async scenarioSource => {
  const win = new BrowserWindow({
    width: 900,
    height: 600,
    show: false,
    webPreferences: {
      preload: join(HERE, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false
    }
  });
  await win.loadFile(join(HERE, 'fixture.html'));
  await win.webContents.executeJavaScript(`${scenarioSource}\nwindow.__SCENARIOS = SCENARIOS; true;`);
  return win;
};

/** 在渲染进程里跑一个事务体，拿回 JSON 安全的报告。 */
const run = (win, variant, name, args) =>
  win.webContents.executeJavaScript(
    `window.__run(${JSON.stringify(variant)}, ${JSON.stringify(name)}, ${JSON.stringify(args)})`
  );

/** 主进程侧的可见性核对。必须在事务落地之后调用 —— 方案 A 的事务挂起时它会排队。 */
const countRows = async ids => {
  const res = await pg.query(`SELECT id, label, amount FROM tx_probe WHERE id = ANY($1::text[]) ORDER BY id`, [ids]);
  return res.rows;
};

/** PGlite 实例；两案共用，同时也是 AC#7「主进程单实例」的可行性证据。 */
let pg = null;

/**
 * 跑完一案的全部用例。
 *
 * @param variant - `'a'` 或 `'b'`
 * @param host - 对应的主进程 host，用于读协议接口面与在途状态
 * @param scenarioSource - 注入渲染进程的事务体源码
 */
const runVariant = async (variant, host, scenarioSource) => {
  const tag = variant.toUpperCase();
  const win = await openWindow(scenarioSource);
  currentWindow = win;

  // ---------- AC#2 正向：事务内多次读写 ----------
  const ids = {
    idA: `${variant}-commit-a`,
    idB: `${variant}-commit-b`,
    childId: `${variant}-child`
  };
  const committed = await run(win, variant, 'writeReadWrite', ids);
  const visibleAfterCommit = await countRows([ids.idA, ids.idB]);
  record(`AC2.commit.variant${tag}`, committed.ok && visibleAfterCommit.length === 2, {
    report: committed,
    visibleAfterCommit,
    // 事务内读到的必须是自己刚写的、尚未提交的值；JOIN 到子行则证明外键那侧同样可见。
    joinedInsideTx: committed.summary?.joinedInsideTx ?? null,
    amountSeenInsideTx: committed.summary?.amountSeenInsideTx ?? null,
    amountAfterUpdate: committed.summary?.amountAfterUpdate ?? null,
    roundTrips: committed.invokes,
    statements: committed.summary?.statements ?? null
  });

  // ---------- AC#2 反向：中途抛错，一行不落 ----------
  const doomedId = `${variant}-rollback`;
  const failed = await run(win, variant, 'failMidway', { idA: doomedId });
  const visibleAfterRollback = await countRows([doomedId]);
  record(`AC2.rollback.variant${tag}`, !failed.ok && visibleAfterRollback.length === 0, {
    report: failed,
    visibleAfterRollback,
    note: '第一条 INSERT 若留在库里，就说明多条请求被包装成了假事务'
  });

  // ---------- 类型保真 ----------
  const fidelity = await win.webContents.executeJavaScript(
    `window.__fidelity(${JSON.stringify(variant)}, ${JSON.stringify(`${variant}-types`)})`
  );
  const fidelityOk =
    fidelity.ok === true &&
    fidelity.bigint.equal &&
    fidelity.binary.equal &&
    fidelity.jsonb.equal &&
    fidelity.timestamptz.equal;
  record(`types.variant${tag}`, fidelityOk, fidelity);

  // ---------- 变更事件跨进程 ----------
  // 通知在提交时才投递，且 PGlite 要靠后续往返把它冲出来 —— 上面已经跑过好几次查询了。
  await waitFor(async () => {
    const seen = await win.webContents.executeJavaScript('JSON.stringify(window.__events)');
    return JSON.parse(seen).length >= 3;
  }, 5_000);
  const rendererEvents = JSON.parse(await win.webContents.executeJavaScript('JSON.stringify(window.__events)'));
  const rendererIds = rendererEvents.map(event => event.payload);
  record(
    `events.variant${tag}`,
    rendererIds.includes(ids.idA) && rendererIds.includes(ids.idB) && !rendererIds.includes(doomedId),
    {
      rendererIds,
      mainIds: notifiedInMain.map(event => event.payload),
      committedIds: [ids.idA, ids.idB],
      rolledBackId: doomedId,
      note: '回滚掉的那行不该产生通知：PG 的 pg_notify 随事务提交才投递'
    }
  );

  // ---------- AC#3：渲染进程崩在事务中途 ----------
  const crash = await runCrashCase(variant, host, win);
  record(`AC3.variant${tag}`, crash.ok, crash.detail);

  currentWindow = null;
  if (!win.isDestroyed()) win.destroy();
};

/**
 * 崩溃用例：两案的形状不同，因为「事务中途」这个时刻在两案里根本不是同一种状态。
 *
 * - 方案 A：事务真的悬在那儿（PGlite 的 callback 被挂起、连接锁被占）。要验的是主进程
 *   能否检测并回收，以及回收后库还能不能用。
 * - 方案 B：整条事务在一次 invoke 里，压根不存在「悬挂」这种状态。要验的是崩溃后
 *   主进程实际会怎么做 —— 这是两案最本质的语义差异，不能靠推理，只能实测。
 */
const runCrashCase = async (variant, host, win) => {
  const ownerId = win.webContents.id;
  const hangingId = `${variant}-crash`;

  if (variant === 'a') {
    await win.webContents.executeJavaScript(`window.__hangA(${JSON.stringify(hangingId)}); true;`);
    const opened = await waitFor(
      async () => (await win.webContents.executeJavaScript('window.__hangState')) === 'open',
      5_000
    );
    if (!opened) {
      return { ok: false, detail: { reason: '未能造出悬挂事务', openCount: host.openCount } };
    }

    const openBeforeCrash = host.openCount;
    win.webContents.forcefullyCrashRenderer();
    // 等的是「回收动作已登记」而不只是 openCount 归零：`settle` 先从 Map 里摘掉再等
    // `pg.transaction` 落地，只看计数会在 ROLLBACK 还在飞的时候就放行。
    const reclaimed = await waitFor(
      () => host.openCount === 0 && reclamations.some(item => item.owner === ownerId),
      10_000
    );

    // 回收后库必须立刻可用：挂起的 callback 独占 PGlite 连接锁，没回收干净的话
    // 这条 SELECT 会永远排队 —— 表征是「数据库没响应」，与崩溃现场没有任何关联线索。
    const probeStarted = Date.now();
    const usable = await Promise.race([pg.query('SELECT 1 AS ok').then(() => true), sleep(5_000).then(() => false)]);
    const rows = await countRows([hangingId]);
    return {
      ok: reclaimed && usable && rows.length === 0,
      detail: {
        openBeforeCrash,
        openAfterReclaim: host.openCount,
        reclaimedByHost: reclamations.filter(item => item.owner === ownerId),
        databaseUsableAfterReclaim: usable,
        databaseProbeMs: Date.now() - probeStarted,
        hangingRowVisible: rows.length > 0,
        note: '悬挂事务必须被回滚并释放连接锁，否则整个库随渲染进程一起死掉（AC#3）'
      }
    };
  }

  // 方案 B：崩溃点只能定在「主进程已接受请求、事务尚未开始执行」的那一刻。
  //
  // 第一版实验想的是「发请求 → 轮询 inFlight > 0 → 杀渲染进程」，实测 `inFlight` 恒为 0：
  // PGlite 的 WASM 同步跑在**主进程的 JS 线程**上，`pg_sleep(2)` 期间定时器、IPC、窗口消息
  // 全部停摆，轮询根本没机会跑；等主线程缓过来时事务早就提交完了。也就是说本方案下
  // 「事务中途」这个时刻从主进程外面**观察不到**，那一版量到的 `committedDespiteCrash`
  // 其实是「事务结束之后才杀的进程」，什么都没证明。
  //
  // 改成在 `ipcMain.handle` 的入口处、`pg.transaction` 之前就把渲染进程杀掉：请求已被受理、
  // 事务马上要跑，调用方却已经不存在了。这足以证明「发出去就没有取消点」。
  // 主线程被阻塞多久由心跳量出来（`mainThreadBlockedMs`），它本身也是 AC#7 的关键输入。
  const caseStartedAt = Date.now();
  // 第一拍必须同步打下：请求可能在本函数让出线程后的同一毫秒就到达（实测
  // msFromCaseStartToCrashIssued = 0），定时器一拍都没轮到就被 PGlite 占住了主线程 ——
  // 那样 beats 里全是阻塞「之后」的样本，间隔恒为几十毫秒，会得出「没有阻塞」的错误结论。
  const beats = [Date.now()];
  const heartbeat = setInterval(() => beats.push(Date.now()), 25);
  let crashIssuedAt = 0;
  setBeforeHandleB(sender => {
    crashIssuedAt = Date.now();
    sender.forcefullyCrashRenderer();
  });

  // 不 await：渲染进程会在这次 `executeJavaScript` 回执送达之前就被杀掉，
  // 那时它会以 "Render frame was disposed" 拒绝，而那与被测内容无关。
  void win.webContents
    .executeJavaScript(`window.__slowB(${JSON.stringify(hangingId)}, 2); true;`)
    .catch(() => undefined);

  const accepted = await waitFor(() => crashIssuedAt > 0, 10_000);
  const drained = await waitFor(() => host.inFlight === 0, 30_000);
  const drainedAt = Date.now();
  // 主线程缓过来之后再放几拍心跳：阻塞窗口的「后沿」没有采样点的话，
  // beats 里只剩阻塞前的那一拍，算不出任何间隔，量出来恒为 0。
  await sleep(200);
  clearInterval(heartbeat);
  // 崩溃事件是在主线程被 PGlite 占满期间排队的，等主线程恢复才投递，
  // 回收登记还要再过一个 promise —— 必须显式等，不能顺手读一眼就下结论。
  const rendererGone = await waitFor(() => reclamations.some(item => item.owner === ownerId), 10_000);
  const rows = await countRows([hangingId]);

  const gaps = beats.slice(1).map((beat, index) => beat - beats[index]);
  const mainThreadBlockedMs = gaps.length > 0 ? Math.max(...gaps) : 0;

  return {
    // `ok` 只回答「这次实验做得算不算数」：请求确实被受理、崩溃确实在事务执行前发出、
    // 主进程最终排空。至于那条事务被提交了还是被丢弃了，是**实测记录**
    // （`committedDespiteCrash`），由 spec 侧读出来写进选型依据，不在这里下结论。
    ok: accepted && drained && rendererGone,
    detail: {
      crashIssuedBeforeTransaction: accepted,
      rendererGone,
      drained,
      committedDespiteCrash: rows.length > 0,
      rows,
      mainThreadBlockedMs,
      heartbeatSamples: beats.length,
      msFromCaseStartToCrashIssued: crashIssuedAt - caseStartedAt,
      msFromCrashIssuedToDrained: drainedAt - crashIssuedAt,
      scenarioMsInMain: host.lastScenarioMs,
      reclaimedByHost: reclamations.filter(item => item.owner === ownerId),
      note:
        '本方案没有跨 invoke 的事务状态，因此也没有取消点：请求受理后渲染进程即使立刻消失，' +
        '主进程仍会把整条事务跑完并提交。mainThreadBlockedMs 是 PGlite 同步占用主进程 JS 线程的时长。'
    }
  };
};

/** 主进程实际执行过的回收动作，两案共用一张表。 */
const reclamations = [];

/**
 * 方案 B 通道上的一次性钩子：在 `hostB.handle` 之前、事务开始执行之前跑。
 *
 * @remarks
 * 崩溃用例唯一能确定落在「请求已受理、事务未执行」这一刻的切入点。PGlite 同步占用
 * 主进程 JS 线程，一旦进了 `pg.transaction`，主进程就什么都做不了了。
 */
let beforeHandleB = null;
const setBeforeHandleB = hook => {
  beforeHandleB = hook;
};

/** 当前接收变更通知的窗口。崩溃后置空，避免往死掉的 webContents 上 send。 */
let currentWindow = null;

app.whenReady().then(async () => {
  try {
    record('versions', true, {
      electron: process.versions.electron,
      chrome: process.versions.chrome,
      node: process.versions.node
    });

    const { PGlite } = await import('@electric-sql/pglite');
    dataDir = mkdtempSync(join(tmpdir(), 'us208-tx-'));
    pg = await PGlite.create({ dataDir });
    await pg.exec(SCHEMA_SQL);

    await pg.listen(NOTIFY_CHANNEL, payload => {
      const message = { channel: NOTIFY_CHANNEL, payload, at: Date.now() };
      notifiedInMain.push(message);
      if (currentWindow && !currentWindow.isDestroyed()) currentWindow.webContents.send(CHANNEL_EVENT, message);
    });

    record('setup', true, { dataDir, pgliteVersion: (await pg.query('SELECT version()')).rows[0]?.version ?? null });

    const hostA = createVariantAHost({ pg });
    const hostB = createVariantBHost({ pg });

    ipcMain.handle(CHANNEL_A, (event, payload) => hostA.handle(event.sender.id, payload));
    ipcMain.handle(CHANNEL_B, (event, payload) => {
      if (beforeHandleB) {
        const hook = beforeHandleB;
        beforeHandleB = null;
        hook(event.sender);
      }
      return hostB.handle(event.sender.id, payload);
    });

    // 崩溃回收的接线。两案都挂：方案 B 的 releaseOwner 是空操作，但「挂了也无事可回收」
    // 本身就是要记录的事实，不能靠「没挂」来制造这个结论。
    app.on('web-contents-created', (_event, contents) => {
      const reclaim = reason => {
        void Promise.all([hostA.releaseOwner(contents.id), hostB.releaseOwner(contents.id)]).then(([a, b]) => {
          if (a + b > 0 || reason === 'render-process-gone') {
            reclamations.push({ owner: contents.id, reason, variantA: a, variantB: b, at: Date.now() });
          }
        });
      };
      contents.on('render-process-gone', () => reclaim('render-process-gone'));
      contents.on('destroyed', () => reclaim('destroyed'));
    });

    // 事务体源码：读原文、剥 `export`，注入渲染进程。方案 B 那侧是真的 import 同一个文件。
    const scenarioSource = (await readFile(join(HERE, 'scenarios.mjs'), 'utf8')).replace(/^export /gm, '');

    await runVariant('a', hostA, scenarioSource);
    await runVariant('b', hostB, scenarioSource);

    // ---------- 协议接口面：随用例数增长的斜率 ----------
    record('surface', true, {
      variantA: {
        opKinds: [...hostA.opKinds],
        bodiesInMain: [],
        note: '四个操作恒定，与业务有多少种事务无关；事务体留在渲染进程'
      },
      variantB: {
        opKinds: [...hostB.opKinds],
        bodiesInMain: [...hostB.bodiesInMain],
        note: '业务每多一种事务，主进程就要多一个事务体；渲染进程能做的事等于主进程列出的事'
      }
    });

    // ---------- 往返次数与耗时对照 ----------
    const commitA = findings.find(item => item.step === 'AC2.commit.variantA');
    const commitB = findings.find(item => item.step === 'AC2.commit.variantB');
    record('roundTrips', true, {
      statements: commitA.detail.statements,
      variantA: { invokes: commitA.detail.report.invokes, ms: commitA.detail.report.ms },
      variantB: { invokes: commitB.detail.report.invokes, ms: commitB.detail.report.ms },
      note: '同一个事务体、同样的 SQL；A 是 begin + 每语句一次 + commit，B 恒为 1'
    });

    // ---------- AC#1 前身：关掉再打开同一个 dataDir ----------
    await pg.close();
    const reopened = await PGlite.create({ dataDir });
    const survivors = await reopened.query(`SELECT id FROM tx_probe ORDER BY id`);
    const persistedIds = survivors.rows.map(row => row.id);
    await reopened.close();
    record('persistence', persistedIds.includes('a-commit-a') && persistedIds.includes('b-commit-a'), {
      dataDir,
      persistedIds,
      note: '两案提交的行都要在重开同一个 dataDir 后还在；回滚掉的与悬挂的都不该出现'
    });

    finish(0);
  } catch (error) {
    record('fatal', false, { error: String(error), stack: error?.stack });
    finish(1);
  }
});
