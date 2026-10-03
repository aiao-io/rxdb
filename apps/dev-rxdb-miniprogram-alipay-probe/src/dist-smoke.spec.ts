/**
 * 构建产物冒烟：把 `dist/` 的三个包放进独立的 vm 上下文里跑。页面与核心包共用一个上下文，
 * 和逻辑层一样只有 ECMAScript 内置对象加上平台注入的 `my` / `Page` / `require` 与计时器——
 * 两端逻辑层都没有 `crypto`、`queueMicrotask`、`TextEncoder` / `TextDecoder`（v2 探针实测），这里也不给。
 * Worker 包另起一个上下文，只有 `worker` / `MYWebAssembly` / `crypto`，`my.createWorker` 接到它上面。
 *
 * 源码级测试（run-probe.spec.ts）跑在 Node 全局上，抓不到「打包后的模块顶层副作用」与
 * 「Worker 包的接线写错」这两类问题。
 */
import { transform } from 'esbuild';
import { webcrypto } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createContext, runInContext } from 'node:vm';
import { buildProbe, CORE_REQUEST, coreInitErrorWrapper } from '../scripts/build.mjs';
import { addWasmBytes, createFakeAlipay, wasmBytes } from './__tests__/fake-alipay.js';
import type { AlipayApi, AlipayWorker } from './alipay-api.js';
import { WASM_TEXT_SUFFIX } from './alipay-host.js';

interface CapturedPage {
  data: { reportText: string; status: string };
  runExperiments(this: CapturedPage): Promise<void>;
}

interface PageInstance {
  data: Record<string, unknown>;
  setData(patch: Record<string, unknown>): void;
}

/**
 * - `ios`：逻辑层 `globalThis` 是对象（v2 探针 iOS 实测）
 * - `simulator`：v3b 探针模拟器实测——包装函数把 `globalThis` / `global` 遮成 `undefined`，代码跑在严格模式
 *   （非严格函数的 `this` 也是 `undefined`），`Function` 被换成另一个 realm 的构造器
 *   （`Function('return this')()` 拿到的对象没有 `BigInt`），逻辑层本身也没有 `BigInt` / `queueMicrotask`；
 *   在 `Object.prototype` 上临时挂 getter、以自由变量读它，`this` 就是真实全局对象（经 CDP 实测）
 */
type DistMode = 'ios' | 'simulator';

/** 模块顶层抛错时 `require` 的行为：`throw` 原样抛出；`swallow` 吞掉错误、返回填了一半的 `module.exports`。 */
type InitErrorBehavior = 'throw' | 'swallow';

let outDir: string;

beforeAll(async () => {
  outDir = await buildProbe(await mkdtemp(join(tmpdir(), 'alipay-probe-dist-')));
}, 120_000);

afterAll(async () => {
  await rm(outDir, { recursive: true, force: true });
});

function evaluateCommonJs(
  code: string,
  context: object,
  require: (path: string) => unknown,
  mode: DistMode,
  onInitError: InitErrorBehavior = 'throw'
): unknown {
  const module = { exports: {} };
  const shadowed = mode === 'simulator';
  const parameters = shadowed ? 'module, exports, require, globalThis, global, Function' : 'module, exports, require';
  const source = `(function (${parameters}) {${shadowed ? '"use strict";' : ''}\n${code}\n})`;
  const wrapper = runInContext(source, context) as (
    module: { exports: object },
    exports: object,
    require: (path: string) => unknown,
    shadowedGlobal?: undefined,
    shadowedNodeGlobal?: undefined,
    foreignFunction?: FunctionConstructor
  ) => void;
  try {
    wrapper(module, module.exports, require, undefined, undefined, shadowed ? foreignFunction() : undefined);
  } catch (error) {
    if (onInitError === 'throw') throw error;
  }
  return module.exports;
}

/** 另一个 realm 的 `Function`：`Function('return this')()` 拿到的是那个 realm 的全局，同样没有 `BigInt`。 */
function foreignFunction(): FunctionConstructor {
  const foreign = createContext({});
  runInContext('delete globalThis.BigInt', foreign);
  return runInContext('Function', foreign) as FunctionConstructor;
}

const SILENT_CONSOLE = { log: () => undefined, error: () => undefined, warn: () => undefined };

/** 跑 `workers/index.js`：消息经 `setTimeout` 投递并做结构化复制，和真机跨线程一样不共享引用。 */
function startDistWorker(workerCode: string, onTerminate: () => void): AlipayWorker {
  let pageListener: ((message: unknown) => void) | undefined;
  let workerListener: ((message: unknown) => void) | undefined;
  let alive = true;
  const context = createContext({
    console: SILENT_CONSOLE,
    setTimeout,
    clearTimeout,
    crypto: webcrypto,
    MYWebAssembly: {
      // 只认代码包根的绝对路径（两端实测），字节直接从构建产物读，顺带核对 add.wasm 进了 dist
      async instantiate(path: string, imports: WebAssembly.Imports) {
        if (!path.startsWith('/')) throw new Error(`MYWebAssembly.instantiate:fail ${path} not found`);
        return WebAssembly.instantiate(await readFile(join(outDir, path)), imports);
      }
    },
    worker: {
      onMessage(listener: (message: unknown) => void) {
        workerListener = listener;
      },
      postMessage(message: object) {
        const copy: unknown = structuredClone(message);
        setTimeout(() => alive && pageListener?.(copy), 0);
      }
    }
  });
  evaluateCommonJs(workerCode, context, () => undefined, 'ios');
  return {
    postMessage(message) {
      const copy: unknown = structuredClone(message);
      setTimeout(() => workerListener?.(copy), 0);
    },
    onMessage(listener) {
      pageListener = listener;
    },
    terminate() {
      if (alive) onTerminate();
      alive = false;
    }
  };
}

interface DistRun {
  readonly report: Record<string, unknown>;
  /** 跑完后页面上的状态文案。 */
  readonly status: string;
  readonly liveWorkers: number;
}

interface DistOptions {
  /**
   * 给逻辑层补上宿主的 `queueMicrotask`。两端实测都没有，实验 host 会自己补（见 `runtimeRepairs`）；
   * 打开它是对照实验：平台自带时实验 host 不该再动它。
   */
  readonly hostQueueMicrotask?: boolean;
}

async function runDist(mode: DistMode, options: DistOptions = {}): Promise<DistRun> {
  // 页面传不进实验计划，限额只能按文档默认（单文件 10 MiB、用户目录 50 MiB）
  const fake = createFakeAlipay({ mode });
  const workerCode = await readFile(join(outDir, 'workers/index.js'), 'utf8');
  let liveWorkers = 0;
  const my: AlipayApi = {
    ...fake.my,
    createWorker(path) {
      if (path !== 'workers/index.js') throw new Error(`页面创建了意料之外的 Worker：${path}`);
      liveWorkers++;
      return startDistWorker(workerCode, () => liveWorkers--);
    }
  };
  let page: CapturedPage | undefined;
  const context = createContext({
    my,
    console: SILENT_CONSOLE,
    setTimeout,
    clearTimeout,
    Page: (options: CapturedPage) => {
      page = options;
    },
    ...(options.hostQueueMicrotask ? { queueMicrotask } : {})
  });
  if (mode === 'simulator') runInContext('delete globalThis.BigInt', context);
  const coreCode = await readFile(join(outDir, 'probe-core.js'), 'utf8');
  const pageCode = await readFile(join(outDir, 'pages/index/index.js'), 'utf8');
  const requireFromPage = (path: string): unknown => {
    if (path !== CORE_REQUEST) throw new Error(`页面包 require 了意料之外的路径：${path}`);
    return evaluateCommonJs(coreCode, context, requireFromPage, mode);
  };
  evaluateCommonJs(pageCode, context, requireFromPage, mode);
  if (!page) throw new Error('页面包没有调用 Page()');
  const instance: PageInstance = {
    data: { ...page.data },
    setData(patch) {
      Object.assign(this.data, patch);
    }
  };
  await page.runExperiments.call(Object.assign(Object.create(page) as CapturedPage, instance));
  return {
    report: JSON.parse(String(instance.data['reportText'])) as Record<string, unknown>,
    status: String(instance.data['status']),
    liveWorkers
  };
}

const ALL_PASS = ['WASM', '同步 FS', '随机源', '用户目录', '持久化'].map(matrixRow =>
  expect.objectContaining({ matrixRow, verdict: 'pass' })
);

describe('dist 冒烟', () => {
  it('页面包只以字面量路径引用核心包，Worker 包不含 adapter', async () => {
    const pageCode = await readFile(join(outDir, 'pages/index/index.js'), 'utf8');
    const workerCode = await readFile(join(outDir, 'workers/index.js'), 'utf8');
    expect(pageCode).toContain(`require("${CORE_REQUEST}")`);
    expect(pageCode).not.toMatch(/createWaSqliteMiniProgramClient/);
    expect(workerCode).not.toMatch(/createWaSqliteMiniProgramClient/);
  });

  it('Worker 包已经是 ES5：IDE 按 transpile.script.ignore 跳过它，并按 ES5 语法检查', async () => {
    const workerCode = await readFile(join(outDir, 'workers/index.js'), 'utf8');
    const config = JSON.parse(await readFile(join(outDir, 'mini.project.json'), 'utf8')) as unknown;
    expect(config).toMatchObject({ compileOptions: { transpile: { script: { ignore: ['workers/**'] } } } });
    // 降级到 ES5 不改动任何代码，说明里面没有 ES5 之后的语法（esbuild 降不了的语法会直接抛错）。
    // 对照组关掉对象字面量扩展，否则 esbuild 会把 `{ a: a }` 规范成简写，凭空多出差异
    const asIs = await transform(workerCode, {
      target: 'esnext',
      format: 'cjs',
      supported: { 'object-extensions': false }
    });
    const lowered = await transform(workerCode, { target: 'es5', format: 'cjs' });
    expect(lowered.code).toBe(asIs.code);
  });

  it.each([
    ['wa-sqlite/wa-sqlite.wasm', wasmBytes],
    ['wasm/add.wasm', addWasmBytes]
  ])(
    '%s 与它的 base64 文本副本都在代码包里（副本给模拟器用，iOS 真机代码包会丢掉 .txt），副本解码后与原文件逐字节一致',
    async (path, bytes) => {
      expect((await readFile(join(outDir, path))).equals(bytes)).toBe(true);
      const text = await readFile(join(outDir, `${path}${WASM_TEXT_SUFFIX}`), 'utf8');
      expect(Buffer.from(text, 'base64').equals(bytes)).toBe(true);
    }
  );

  it('构建包装把模块顶层错误挂到导出上，平台吞掉错误时导出照样带着原始错误', () => {
    const { banner, footer } = coreInitErrorWrapper();
    const code = `${banner}\nexports.ready = true;\nthrow new RangeError('模块顶层出错');\n${footer}`;
    const exports = evaluateCommonJs(code, createContext({}), () => undefined, 'ios', 'swallow') as {
      readonly ready?: boolean;
      readonly initError?: { readonly name: string; readonly message: string };
    };
    expect(exports.ready).toBe(true);
    expect(exports.initError).toMatchObject({ name: 'RangeError', message: '模块顶层出错' });
  });

  it('iOS 形态：banner 只留记录、Worker 包接线正确；实验 host 补上 queueMicrotask 后跑通全部实验', async () => {
    const { report, status, liveWorkers } = await runDist('ios');
    const untouched = { before: 'object', candidates: {}, chosen: null };
    expect(report['realmProbe']).toEqual({ page: untouched, core: untouched });
    expect(report['worker']).toMatchObject({
      ok: true,
      value: {
        freeGlobals: { my: 'undefined', MYWebAssembly: 'object', crypto: 'object' },
        MYWebAssembly: { ok: true, value: { path: '/wasm/add.wasm', addResult: 5 } }
      }
    });
    expect(report['environment']).toMatchObject({
      freeGlobals: { crypto: 'undefined', queueMicrotask: 'undefined', TextDecoder: 'undefined' }
    });
    expect(report['runtimeRepairs']).toMatchObject({
      ok: true,
      value: {
        target: 'globalThis',
        before: { BigInt: 'function', queueMicrotask: 'undefined' },
        installed: ['queueMicrotask']
      }
    });
    expect(report['wasm']).toMatchObject({
      sources: {
        'wasm/add.wasm': { ok: true, value: 'binary' },
        'wa-sqlite/wa-sqlite.wasm': { ok: true, value: 'binary' }
      }
    });
    expect(report['prepare']).toMatchObject({ ok: true });
    expect(report['coreLoad']).toMatchObject({ ok: true });
    expect(report['findings']).toEqual(ALL_PASS);
    expect(findingEvidence(report, '持久化')).toContain('实验 host 补了 queueMicrotask');
    // 真机上不复制报告也能看出跑的是哪一版：IDE 打开的若是旧产物，这里的 schema 就对不上
    expect(status).toContain(String(report['schema']));
    expect(liveWorkers).toBe(0);
  }, 120_000);

  it('模拟器形态：Object.prototype getter 找回真实全局对象，补上 BigInt 与 queueMicrotask，经分帧层跑通', async () => {
    const { report, liveWorkers } = await runDist('simulator');
    const missing = {
      type: 'undefined',
      isRealm: false,
      promiseMatchesFree: false,
      BigInt: 'n/a',
      queueMicrotask: 'n/a'
    };
    const record = {
      before: 'undefined',
      candidates: {
        sloppyThis: missing,
        Function: {
          type: 'object',
          isRealm: false,
          promiseMatchesFree: false,
          BigInt: 'undefined',
          queueMicrotask: 'undefined'
        },
        global: missing,
        objectPrototypeGetter: {
          type: 'object',
          isRealm: true,
          promiseMatchesFree: true,
          BigInt: 'undefined',
          queueMicrotask: 'undefined'
        }
      },
      chosen: 'objectPrototypeGetter'
    };
    // 核心包在补丁之后才加载，它的 banner 看到的 BigInt / queueMicrotask 已经是补上的
    const coreCandidate = {
      ...record.candidates.objectPrototypeGetter,
      BigInt: 'function',
      queueMicrotask: 'function'
    };
    expect(report['realmProbe']).toEqual({
      page: record,
      core: { ...record, candidates: { ...record.candidates, objectPrototypeGetter: coreCandidate } }
    });
    expect(report['environment']).toMatchObject({ freeGlobals: { globalThis: 'undefined', BigInt: 'undefined' } });
    expect(report['runtimeRepairs']).toMatchObject({
      ok: true,
      value: {
        target: 'banner',
        before: { BigInt: 'undefined', queueMicrotask: 'undefined' },
        installed: ['BigInt', 'queueMicrotask']
      }
    });
    expect(report['wasm']).toMatchObject({
      sources: { 'wa-sqlite/wa-sqlite.wasm': { ok: true, value: 'textCopy' } }
    });
    expect(report['prepare']).toMatchObject({ ok: true });
    expect(report['coreLoad']).toMatchObject({ ok: true });
    expect(report['findings']).toEqual([
      expect.objectContaining({ matrixRow: 'WASM', verdict: 'pass' }),
      expect.objectContaining({ matrixRow: '同步 FS', verdict: 'pass' }),
      expect.objectContaining({ matrixRow: '随机源', verdict: 'pass' }),
      expect.objectContaining({ matrixRow: '用户目录', verdict: 'pass' }),
      expect.objectContaining({
        matrixRow: '持久化',
        verdict: 'pass',
        evidence: expect.stringContaining('实验 host 补了 BigInt、queueMicrotask')
      })
    ]);
    expect(liveWorkers).toBe(0);
  }, 120_000);

  it('对照：平台自带 queueMicrotask 时实验 host 什么都不补', async () => {
    const { report } = await runDist('ios', { hostQueueMicrotask: true });
    expect(report['runtimeRepairs']).toMatchObject({ ok: true, value: { installed: [] } });
    expect(report['findings']).toEqual(ALL_PASS);
    expect(findingEvidence(report, '持久化')).not.toContain('实验 host 补了');
  }, 120_000);
});

function findingEvidence(report: Record<string, unknown>, row: string): string | undefined {
  return (report['findings'] as { matrixRow: string; evidence: string }[]).find(item => item.matrixRow === row)
    ?.evidence;
}
