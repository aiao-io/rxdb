/**
 * 支付宝开发者工具模拟器上的探针事实（v3e，开发者工具 3.10.15，2026-10-03 实测）。
 *
 * 每次跑都停掉再启动编译（工具栏开关），从磁盘重读 dist/，等新一轮报告，再逐条对照。这些断言钉的是**模拟器**，
 * 不是真机：iOS 真机上 `globalThis` / `BigInt` 都在、能写空文件，结论见探针 README 的平台差异表。
 * 模拟器上 adapter 能跑通，靠的是 adapter 里正式支付宝 host 的三处绕行：Object.prototype getter 找回真实全局对象并补
 * `BigInt` / `queueMicrotask`、用户文件分帧避开空写入、wasm 从 base64 文本副本读。v7 起探针走正式 host，
 * 上面 v3e 的形态断言照旧，Worker 与 WASM 两条按 v7 报告改写，待重跑确认。
 * 哪条变红就说明 IDE 升级或探针改动改变了模拟器形态，要回去更新 README 与可行性矩阵。
 */
import { expect, test } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { CdpConnection } from './cdp.js';
import { resolveWsEndpoint } from './devtools-endpoint.js';
import { runProbeOnSimulator, type ProbeReport } from './simulator.js';

const MIB = 1024 * 1024;
/** 每轮报告原样落盘，断言红了直接看这份。 */
const REPORT_DIR = 'test-output';
const REPORT_FILE = `${REPORT_DIR}/simulator-report.json`;
/** 一轮探针实测约 122 秒，余量留给编译；须小于 playwright.config.ts 的用例超时。 */
const PROBE_TIMEOUT_MS = 240_000;

let report: ProbeReport;

test.beforeAll(async () => {
  const cdp = await CdpConnection.open(resolveWsEndpoint());
  try {
    report = await runProbeOnSimulator(cdp, PROBE_TIMEOUT_MS);
    mkdirSync(REPORT_DIR, { recursive: true });
    writeFileSync(REPORT_FILE, `${JSON.stringify(report, null, 2)}\n`);
  } finally {
    cdp.close();
  }
});

test('报告是本工程的 v7 schema', () => {
  expect(report.schema).toBe('aiao.us-211.alipay-probe/v7');
});

test('逻辑层：没有 globalThis / BigInt / queueMicrotask / crypto，标准 WebAssembly 在', () => {
  expect(report['environment']).toMatchObject({
    freeGlobals: {
      my: 'object',
      globalThis: 'undefined',
      global: 'undefined',
      BigInt: 'undefined',
      queueMicrotask: 'undefined',
      crypto: 'undefined',
      WebAssembly: 'object'
    }
  });
});

test('realm 探测：严格模式下 this 是 undefined、Function 换成了别的 realm，只有 Object.prototype getter 拿到真实全局对象', () => {
  const pageCandidates = {
    sloppyThis: { type: 'undefined' },
    Function: { type: 'object', isRealm: false, BigInt: 'undefined' },
    global: { type: 'undefined' },
    objectPrototypeGetter: { type: 'object', isRealm: true, promiseMatchesFree: true, BigInt: 'undefined' }
  };
  expect(report['realmProbe']).toMatchObject({
    page: { before: 'undefined', candidates: pageCandidates, chosen: 'objectPrototypeGetter' },
    // 核心包在页面补完之后才加载：同一个全局对象上已经有了补上的两个全局
    core: {
      before: 'undefined',
      candidates: { objectPrototypeGetter: { isRealm: true, BigInt: 'function', queueMicrotask: 'function' } },
      chosen: 'objectPrototypeGetter'
    }
  });
});

test('引导：正式 host 在自己找到的全局对象上补 BigInt 与 queueMicrotask，prepare 与核心包加载都成功', () => {
  expect(report['runtimeSnapshot']).toMatchObject({
    ok: true,
    value: { before: { BigInt: 'undefined', queueMicrotask: 'undefined' }, installed: ['BigInt', 'queueMicrotask'] }
  });
  expect(report['prepare']).toMatchObject({
    ok: true,
    value: { random: 'wechat', structuredClone: 'native', textEncoder: 'polyfill', textDecoder: 'polyfill' }
  });
  expect(report['coreLoad']).toMatchObject({ ok: true });
});

test('Worker：adapter 包里的预编译 ES5 Worker 跑得起来，经正式 host 取回 16 字节随机数', () => {
  expect(report['worker']).toMatchObject({ ok: true, value: { byteLength: 16, allZero: false } });
});

test('WASM：二进制读被当 UTF-8 文本改写、与锁定版本指纹不符，正式 host 改用文本副本', () => {
  expect(report['wasm']).toMatchObject({
    standardAvailable: true,
    // 磁盘上 727646 字节，非法 UTF-8 序列各变成 EF BF BD
    codePackageBinary: { ok: true, value: { binaryBytes: 814_795, expectedBytes: 727_646, bytesMatch: false } },
    sources: { 'wa-sqlite/wa-sqlite.wasm': { ok: true, value: 'textCopy' } }
  });
});

test('裸 FS：只有 base64 串两端字节一致；空写入报 error 2，写到不存在的父目录照样成功', () => {
  expect(report['rawFs']).toMatchObject({
    writeModes: {
      base64String: { bytesMatch: true },
      arrayBuffer: { bytesMatch: false },
      typedArray: { bytesMatch: false }
    },
    emptyWrite: { ok: true, value: { error: 2 } },
    missingParentWrite: { ok: true, value: { success: true } }
  });
});

test('包装层 + 分帧层 FS：空写入也落得了盘，全部探测符合 adapter VFS 的预期', () => {
  const probes = (report['fileSystem'] as { probes: { op: string; asExpected: boolean }[] }).probes;
  expect(probes.filter(item => !item.asExpected).map(item => item.op)).toEqual([]);
});

test('配额计费：单文件 7 MiB 写得进、8 MiB 撞 10028；写到 77 MiB 也没撞文件夹上限', () => {
  expect(report['quotaAccounting']).toMatchObject({
    largestSingleWriteBytes: 7 * MIB,
    firstSingleFailure: { bytes: 8 * MIB, error: { cause: { codes: { error: 10028 } } } },
    fill: { fileBytes: 7 * MIB, filesWritten: 11, bytesWritten: 77 * MIB, scope: null }
  });
});

test('核心实验：adapter 建库、读写、关闭重开逐字一致；写 120 × 512 KiB 没撞配额', () => {
  expect(report['core']).toMatchObject({
    persistence: { status: 'passed', integrity: 'ok', wasmPath: 'wa-sqlite/wa-sqlite.wasm' },
    quota: { status: 'not-triggered', plan: { blobBytes: 512 * 1024, maxRows: 120 }, insertedRows: 120 }
  });
});

test('findings：五行 pass，用户目录写满 60 MiB 没撞配额、带 quota-unobserved；收尾删干净', () => {
  const findings = report['findings'] as { matrixRow: string; verdict: string; caveat?: string }[];
  expect(findings.map(item => [item.matrixRow, item.verdict, item.caveat])).toEqual([
    ['WASM', 'pass', undefined],
    ['同步 FS', 'pass', undefined],
    ['随机源', 'pass', undefined],
    ['用户目录', 'pass', 'quota-unobserved'],
    ['持久化', 'pass', undefined]
  ]);
  expect(report['cleanup']).toMatchObject({ ok: true });
});
