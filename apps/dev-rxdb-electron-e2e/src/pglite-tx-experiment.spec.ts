import { expect, test } from '@playwright/test';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launchEnv } from './packaged-app';

/**
 * US-208 线 G：PGlite 事务 host **两案对照**（AC#2 / AC#3 的前身 + 选型依据）。
 *
 * @remarks
 * 这不是回归用例，是一次**选型实验**：故事「事务 host 方案二选一」列了两个候选，
 * roadmap 约束 3 要求在动工前把选型冻结。本文件把两案各跑一遍真实 Electron 主进程 +
 * 真实 `ipcRenderer.invoke`，逐条对照后给出结论。
 *
 * 两案的事务体来自同一份源码（`tools/pglite-tx-experiment/scenarios.mjs`）：
 * 方案 A 把它注入渲染进程、按语句拆成多次 invoke；方案 B 直接 `import` 后整体在主进程里跑。
 * SQL 一字不差，所以下面的每一处差异都只能归因于「事务体在哪个进程里跑」。
 *
 * **判定必须可证伪**：语义类断言（提交可见 / 回滚不可见 / 类型保真 / 事件只送已提交的）
 * 两案适用**同一条**标准，谁过不了谁出局；差异类断言（往返次数、接口面斜率、崩溃行为）
 * 断言的是「两案确实不同且方向如预期」，而不是「记录到什么就是什么」。
 *
 * 探针（`tools/pglite-tx-experiment/probe.mjs`）只记录事实，一切红绿在本文件 ——
 * 与阶段 A 的 `devtools-mv3-feasibility.spec.ts` 同一套分工。整个 `pglite-tx-experiment/`
 * 目录与本文件可一并删除，生产主进程一行不用改。
 */

/** 实验探针。不被 `src-electron/` 的任何模块 import，删得掉。 */
const PROBE = join(__dirname, '../../dev-rxdb-electron/tools/pglite-tx-experiment/probe.mjs');

/** 单条 finding 的形状，与探针的 `record()` 一致。 */
interface Finding {
  readonly step: string;
  readonly ok: boolean;
  readonly detail: Record<string, unknown>;
}

/** 渲染进程侧一次事务体运行的报告，与 fixture 的 `window.__run` 一致。 */
interface RunReport {
  readonly ok: boolean;
  readonly error: string | null;
  readonly rolledBack: boolean | null;
  readonly invokes: number;
  readonly ms: number;
  readonly summary: Record<string, unknown> | null;
}

let findings: Map<string, Finding>;
let outputDir: string;

/**
 * 取一条 finding，缺失即失败。
 *
 * @remarks
 * 探针可能在中途 `finish(1)` 提前退出，后续步骤就没有记录。缺失必须红 ——
 * 「没跑到」和「跑过了但不对」在选型结论里同样不可接受。
 */
function finding(step: string): Finding {
  const value = findings.get(step);
  expect(value, `探针未记录 ${step}（可能提前退出）；已有：${[...findings.keys()].join(', ')}`).toBeDefined();
  return value as Finding;
}

/** 断言某条 finding 为真，失败时把该条的完整 detail 打出来。 */
function expectOk(step: string): Finding {
  const value = finding(step);
  expect(value.ok, `${step} 失败：\n${JSON.stringify(value.detail, null, 2)}`).toBe(true);
  return value;
}

/** 两案统一走同一批断言，用它遍历。 */
const VARIANTS = [
  { key: 'A', label: '方案 A（IPC 事务 ID 协议）' },
  { key: 'B', label: '方案 B（adapter 完整托管主进程）' }
] as const;

test.describe('PGlite 事务 host 两案对照（US-208 线 G）', () => {
  // 两案各跑三个事务体 + 两次渲染进程崩溃回收，外加一次 PGlite 重开同一个 dataDir。
  test.describe.configure({ timeout: 300000 });

  test.beforeAll(async () => {
    expect(existsSync(PROBE), `找不到实验探针：${PROBE}`).toBe(true);

    outputDir = mkdtempSync(join(tmpdir(), 'us208-line-g-'));
    const outputPath = join(outputDir, 'result.json');

    // electron 包的默认导出就是可执行文件的绝对路径（以纯 Node 加载时）。
    const executable = require('electron') as unknown as string;

    const exitCode = await new Promise<number>((resolve, reject) => {
      // launchEnv() 会剥掉 ELECTRON_RUN_AS_NODE：任何 Electron 宿主（VS Code 集成终端最常见）
      // 都会给子进程设这个变量，带着它启动会让二进制退化成纯 Node，连 app 对象都没有。
      const child = spawn(executable, [PROBE, outputPath], {
        env: launchEnv(),
        stdio: ['ignore', 'pipe', 'pipe']
      });
      const stderr: string[] = [];
      child.stderr.on('data', chunk => stderr.push(String(chunk)));
      child.on('error', reject);
      child.on('exit', code => {
        if (code !== 0 && !existsSync(outputPath)) {
          reject(new Error(`探针以 ${code} 退出且未产出结果：\n${stderr.join('')}`));
          return;
        }
        resolve(code ?? -1);
      });
    });

    const parsed = JSON.parse(readFileSync(outputPath, 'utf8')) as Finding[];
    findings = new Map(parsed.map(item => [item.step, item]));
    expect(exitCode, `探针退出码非 0；findings：\n${JSON.stringify(parsed, null, 2)}`).toBe(0);
  });

  test.afterAll(() => {
    if (outputDir) rmSync(outputDir, { force: true, recursive: true });
  });

  test('实验前提：单个 PGlite 实例、真实 dataDir、真实 Electron 主进程', () => {
    const versions = finding('versions').detail as { electron: string };
    expect(Number.parseInt(versions.electron, 10)).toBeGreaterThanOrEqual(43);

    const setup = expectOk('setup').detail as { dataDir: string; pgliteVersion: string | null };
    // `store: 'memory'` 下这条实验没有意义：落盘路径的开销与持久化语义都是本故事的正题。
    expect(setup.dataDir).toBeTruthy();
    expect(setup.pgliteVersion).toContain('PostgreSQL');
  });

  // ---------------------------------------------------------------------------
  // 语义：两案同一条标准，过不了就出局
  // ---------------------------------------------------------------------------

  for (const variant of VARIANTS) {
    test(`AC#2 正向 · ${variant.label}：一次事务内多次读写，且读得到自己未提交的写入`, () => {
      const detail = expectOk(`AC2.commit.variant${variant.key}`).detail as {
        report: RunReport;
        visibleAfterCommit: { id: string; amount: number }[];
        joinedInsideTx: number | null;
        amountSeenInsideTx: number | null;
        amountAfterUpdate: number | null;
      };

      expect(detail.report.ok).toBe(true);
      // JOIN 在事务内拿到 1 行 = 新插入的父行与引用它的子行互相可见。
      // 若实现把每条语句拆进各自的隐式事务，这里会是 0（子行的外键根本插不进去）。
      expect(detail.joinedInsideTx).toBe(1);
      expect(detail.amountSeenInsideTx).toBe(10);
      expect(detail.amountAfterUpdate).toBe(15);
      // 提交后主进程直接从 PG 读到两行 —— 这是跨进程的可见性，不是渲染进程自说自话。
      expect(detail.visibleAfterCommit).toHaveLength(2);
      expect(detail.visibleAfterCommit.find(row => row.amount === 15)).toBeDefined();
    });

    test(`AC#2 反向 · ${variant.label}：中途抛错后一行不落`, () => {
      const detail = expectOk(`AC2.rollback.variant${variant.key}`).detail as {
        report: RunReport;
        visibleAfterRollback: unknown[];
      };

      expect(detail.report.ok).toBe(false);
      expect(detail.report.rolledBack).toBe(true);
      // 第一条 INSERT 若留在库里，就说明多条请求被包装成了假事务 —— AC#2 明令禁止。
      expect(detail.visibleAfterRollback).toEqual([]);
    });

    test(`${variant.label}：bigint / bytea / jsonb / timestamptz 跨 IPC 逐值保真`, () => {
      const detail = expectOk(`types.variant${variant.key}`).detail as {
        bigint: { type: string; equal: boolean; sent: string; received: string };
        binary: { type: string; equal: boolean; received: number[] | null };
        jsonb: { type: string; equal: boolean };
        timestamptz: { type: string; equal: boolean; sent: string; received: string };
      };

      // 值取 2^53+1：任何一段路上退化成 number 或途经 JSON，都会变成 9007199254740992。
      expect(detail.bigint.type).toBe('bigint');
      expect(detail.bigint.received).toBe(detail.bigint.sent);
      expect(detail.bigint.equal).toBe(true);

      expect(detail.binary.type).toBe('[object Uint8Array]');
      expect(detail.binary.received).toEqual([0, 1, 127, 128, 254, 255]);

      // jsonb 用结构比较：PostgreSQL 会重排键序，逐字符比对必然误报。
      expect(detail.jsonb.type).toBe('object');
      expect(detail.jsonb.equal).toBe(true);

      expect(detail.timestamptz.type).toBe('[object Date]');
      expect(detail.timestamptz.received).toBe(detail.timestamptz.sent);
    });

    test(`${variant.label}：变更事件跨进程送达，且只送已提交的`, () => {
      const detail = expectOk(`events.variant${variant.key}`).detail as {
        rendererIds: string[];
        mainIds: string[];
        committedIds: string[];
        rolledBackId: string;
      };

      for (const id of detail.committedIds) expect(detail.rendererIds).toContain(id);
      // pg_notify 随事务提交才投递：回滚掉的那行不该惊动渲染进程。
      expect(detail.rendererIds).not.toContain(detail.rolledBackId);
      expect(detail.mainIds).not.toContain(detail.rolledBackId);
    });
  }

  test('两案提交的数据在重开同一个 dataDir 后仍在（AC#1 前身）', () => {
    const detail = expectOk('persistence').detail as { persistedIds: string[] };
    expect(detail.persistedIds).toContain('a-commit-a');
    expect(detail.persistedIds).toContain('b-commit-a');
    // 回滚掉的与崩溃时悬挂的都不该落盘。
    expect(detail.persistedIds).not.toContain('a-rollback');
    expect(detail.persistedIds).not.toContain('b-rollback');
    expect(detail.persistedIds).not.toContain('a-crash');
  });

  // ---------------------------------------------------------------------------
  // 差异：选型依据。断言方向，而不是"记录到什么就是什么"
  // ---------------------------------------------------------------------------

  test('AC#3 · 方案 A：渲染进程崩在事务中途，悬挂事务被回收且数据库仍可用', () => {
    const detail = expectOk('AC3.variantA').detail as {
      openBeforeCrash: number;
      openAfterReclaim: number;
      databaseUsableAfterReclaim: boolean;
      databaseProbeMs: number;
      hangingRowVisible: boolean;
    };

    // 先确认崩溃点真的落在事务中间，否则这条用例什么都没验。
    expect(detail.openBeforeCrash).toBe(1);
    expect(detail.openAfterReclaim).toBe(0);
    expect(detail.hangingRowVisible).toBe(false);
    // 这是方案 A 的生死线：挂起的 callback 独占 PGlite 连接锁，没释放的话后续任何查询
    // 都会永远排队 —— 表征是「数据库没响应」，与崩溃现场毫无关联线索。
    expect(detail.databaseUsableAfterReclaim).toBe(true);
    expect(detail.databaseProbeMs).toBeLessThan(5000);
  });

  test('方案 B：渲染进程崩溃不会挂住数据库，但事务没有取消点', () => {
    const detail = expectOk('AC3.variantB').detail as {
      crashIssuedBeforeTransaction: boolean;
      rendererGone: boolean;
      drained: boolean;
      committedDespiteCrash: boolean;
    };

    // 先确认崩溃确实发在「请求已受理、事务未执行」那一刻，否则下面的结论什么都不证明。
    expect(detail.crashIssuedBeforeTransaction).toBe(true);
    expect(detail.rendererGone).toBe(true);
    expect(detail.drained).toBe(true);
    // 本方案结构上不存在悬挂事务，所以也没有可回收的东西 —— releaseOwner 恒为空操作。
    // 代价随之确定：调用方已经消失，主进程仍把事务跑完并提交，没人再关心结果。
    // 这是选型必须知情的语义差异，因此钉死而不是"记录即可"。
    expect(detail.committedDespiteCrash).toBe(true);
  });

  test('方案 B：崩溃后主进程仍把整条事务跑满，耗时与未崩溃时一致', () => {
    const detail = expectOk('AC3.variantB').detail as {
      scenarioMsInMain: number;
      msFromCrashIssuedToDrained: number;
    };

    // 事务体是 `pg_sleep(2)` + INSERT。渲染进程在事务开跑前就没了，主进程却整整跑满两秒 ——
    // 没有任何一处提前退出。这就是「没有取消点」的量化形态。
    expect(detail.scenarioMsInMain).toBeGreaterThan(1900);
    expect(detail.msFromCrashIssuedToDrained).toBeGreaterThan(1900);
  });

  test('PGlite 同步占用主进程 JS 线程：长事务期间主进程完全停摆', () => {
    const detail = expectOk('AC3.variantB').detail as {
      mainThreadBlockedMs: number;
      scenarioMsInMain: number;
      heartbeatSamples: number;
    };

    // 25ms 一次的心跳，在那两秒里一拍都没轮到 —— 定时器、IPC、窗口消息同此。
    // 阻塞时长与事务耗时基本相等，说明整段执行都压在主进程 JS 线程上。
    expect(detail.heartbeatSamples).toBeGreaterThan(1);
    expect(detail.mainThreadBlockedMs).toBeGreaterThanOrEqual(detail.scenarioMsInMain);
    // 这是两案**共同**的约束（PGlite 的 WASM 就跑在主进程 JS 线程上），不构成区分点，
    // 但它决定了「主进程持 PGlite 单实例」这件事本身必须配 worker 隔离 —— AC#7 的关键输入。
    expect(detail.mainThreadBlockedMs).toBeGreaterThan(1900);
  });

  test('IPC 往返：同一个事务体，方案 A 每语句一次、方案 B 恒为一次', () => {
    const detail = expectOk('roundTrips').detail as {
      statements: number;
      variantA: { invokes: number; ms: number };
      variantB: { invokes: number; ms: number };
    };

    // 六条语句 + begin + commit = 8 次。写死而不是"A > B"：这才能验出
    // 「事务边界由渲染进程掌握」的真实代价，而不是只验出个大小关系。
    expect(detail.statements).toBe(6);
    expect(detail.variantA.invokes).toBe(detail.statements + 2);
    expect(detail.variantB.invokes).toBe(1);
  });

  test('协议接口面：方案 A 恒定四个操作，方案 B 随用例数增长', () => {
    const detail = expectOk('surface').detail as {
      variantA: { opKinds: string[]; bodiesInMain: string[] };
      variantB: { opKinds: string[]; bodiesInMain: string[] };
    };

    // 方案 A 的协议与「业务有多少种事务」无关：本实验跑了四种事务体，四个操作一个没多。
    expect(detail.variantA.opKinds).toEqual(['begin', 'exec', 'commit', 'rollback']);
    expect(detail.variantA.bodiesInMain).toEqual([]);

    // 方案 B 表面只有一个 op，但真正的接口面是主进程里预置的事务体清单 ——
    // 渲染进程能做的事 = 主进程列出的事。这里钉死「清单逐项等于本实验的用例集」，
    // 才说得上「每多一种事务，主进程就得多一条」；只比个数量大小是证明不了斜率的。
    expect(detail.variantB.opKinds).toEqual(['scenario']);
    expect(detail.variantB.bodiesInMain).toEqual(['writeReadWrite', 'failMidway', 'typeFidelity', 'slowInsert']);
  });
});
