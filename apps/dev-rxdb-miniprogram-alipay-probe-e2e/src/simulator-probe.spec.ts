/**
 * 支付宝开发者工具模拟器上的探针事实（v3c，开发者工具 3.10.15，2026-10-03 实测）。
 *
 * 每次跑都点「普通编译」从磁盘重读 dist/，等新一轮报告，再逐条对照。这些断言钉的是**模拟器**，
 * 不是真机：iOS 真机上 `globalThis` / `BigInt` 都在、能写空文件，结论见探针 README 的平台差异表。
 * 哪条变红就说明 IDE 升级或探针改动改变了模拟器形态，要回去更新 README 与可行性矩阵。
 */
import { expect, test } from '@playwright/test';
import { CdpConnection } from './cdp.js';
import { resolveWsEndpoint } from './devtools-endpoint.js';
import { runProbeOnSimulator, type ProbeReport } from './simulator.js';

const MIB = 1024 * 1024;
/** 一轮探针实测 18–40 秒，余量留给编译。 */
const PROBE_TIMEOUT_MS = 150_000;

let report: ProbeReport;

test.beforeAll(async () => {
  const cdp = await CdpConnection.open(resolveWsEndpoint());
  try {
    report = await runProbeOnSimulator(cdp, PROBE_TIMEOUT_MS);
  } finally {
    cdp.close();
  }
});

test('报告是本工程的 v3 schema', () => {
  expect(report.schema).toBe('aiao.us-211.alipay-probe/v3');
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

test('realm 探测：严格模式下 this 是 undefined，Function 换成了别的 realm，三路都拿不到真实全局对象', () => {
  expect(report['realmProbe']).toMatchObject({
    page: {
      before: 'undefined',
      candidates: {
        sloppyThis: { type: 'undefined' },
        Function: { type: 'object', isRealm: false, BigInt: 'undefined' },
        global: { type: 'undefined' }
      },
      chosen: null
    },
    core: null
  });
  expect(report['prepare']).toMatchObject({ ok: false, error: { message: expect.stringContaining('拿不到真实全局对象') } });
  expect(report['coreLoad']).toMatchObject({ ok: false, error: { name: 'ReferenceError', message: 'BigInt is not defined' } });
});

test('Worker：经 swc 降到 ES5 后能跑；有 realm、MYWebAssembly 与 crypto，没有 my', () => {
  expect(report['worker']).toMatchObject({
    ok: true,
    value: {
      freeGlobals: { my: 'undefined', MYWebAssembly: 'object', crypto: 'object', BigInt: 'function', globalThis: 'object' },
      MYWebAssembly: { ok: true, value: { path: '/wasm/add.wasm', addResult: 5 } },
      cryptoGetRandomValues: { ok: true, value: { length: 16 } }
    }
  });
});

test('WASM：逻辑层标准 WebAssembly 实例化 add.wasm', () => {
  expect(report['wasm']).toMatchObject({ standardAvailable: true, add: { ok: true, value: 5 } });
});

test('裸 FS：只有 base64 串两端字节一致', () => {
  expect(report['rawFs']).toMatchObject({
    writeModes: {
      base64String: { bytesMatch: true },
      arrayBuffer: { bytesMatch: false },
      typedArray: { bytesMatch: false }
    }
  });
});

test('包装层 FS：父目录不存在照样写成、空写入报 error 2，其余符合 VFS 预期', () => {
  const probes = (report['fileSystem'] as { probes: { op: string; asExpected: boolean }[] }).probes;
  expect(probes.filter(item => !item.asExpected).map(item => item.op)).toEqual([
    'writeFileSync(父目录不存在)',
    'writeFileSync(空 ArrayBuffer)'
  ]);
});

test('配额计费：单文件 7 MiB 写得进、8 MiB 撞 10028；写到 77 MiB 也没撞文件夹上限', () => {
  expect(report['quotaAccounting']).toMatchObject({
    largestSingleWriteBytes: 7 * MIB,
    firstSingleFailure: { bytes: 8 * MIB, error: { cause: { codes: { error: 10028 } } } },
    fill: { fileBytes: 7 * MIB, filesWritten: 11, bytesWritten: 77 * MIB, scope: null }
  });
});

test('findings：WASM / 用户目录 / 持久化 unknown，同步 FS 与随机源 fail；收尾删干净', () => {
  const findings = report['findings'] as { matrixRow: string; verdict: string }[];
  expect(findings.map(item => [item.matrixRow, item.verdict])).toEqual([
    ['WASM', 'unknown'],
    ['同步 FS', 'fail'],
    ['随机源', 'fail'],
    ['用户目录', 'unknown'],
    ['持久化', 'unknown']
  ]);
  expect(report['cleanup']).toMatchObject({ ok: true });
});
