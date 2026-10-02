/**
 * 构建产物冒烟：把 `dist/` 的三个包放进独立的 vm 上下文里跑。页面与核心包共用一个上下文，
 * 和逻辑层一样只有 ECMAScript 内置对象加上平台注入的 `my` / `Page` / `require` 与计时器——
 * 两端逻辑层都没有 `crypto`、`queueMicrotask`、`TextEncoder` / `TextDecoder`（v2 探针实测），这里也不给。
 * Worker 包另起一个上下文，只有 `worker` / `MYWebAssembly` / `crypto`，`my.createWorker` 接到它上面。
 *
 * 源码级测试（run-probe.spec.ts）跑在 Node 全局上，抓不到「打包后的模块顶层副作用」与
 * 「Worker 包的接线写错」这两类问题。
 */
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { webcrypto } from 'node:crypto';
import { createContext, runInContext } from 'node:vm';
import { transform } from 'esbuild';
import { buildProbe, CORE_REQUEST, coreInitErrorWrapper } from '../scripts/build.mjs';
import type { AlipayApi, AlipayWorker } from './alipay-api.js';
import { createFakeAlipay } from './__tests__/fake-alipay.js';

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
 *   （`Function('return this')()` 拿到的对象没有 `BigInt`），逻辑层本身也没有 `BigInt`
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
  readonly liveWorkers: number;
}

interface DistOptions {
  /**
   * 给逻辑层补上宿主的 `queueMicrotask`。两端实测都没有，adapter 又把它列为硬依赖、不补；
   * 打开它是对照实验：回答「补上它之后还有没有别的阻塞点」，不代表真机形态。只对 iOS 有意义——
   * 模拟器在 realm 与 `BigInt` 上就停了，走不到这一步。
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
  return { report: JSON.parse(String(instance.data['reportText'])) as Record<string, unknown>, liveWorkers };
}

const ALL_PASS = ['WASM', '同步 FS', '随机源', '用户目录', '持久化'].map(matrixRow =>
  expect.objectContaining({ matrixRow, verdict: 'pass' })
);

/** 真机形态：adapter 在打开库之前的能力预检就拒绝，核心实验全部停在第一步。 */
const BLOCKED_BY_QUEUE_MICROTASK = [
  expect.objectContaining({ matrixRow: 'WASM', verdict: 'unknown' }),
  expect.objectContaining({ matrixRow: '同步 FS', verdict: 'pass' }),
  expect.objectContaining({ matrixRow: '随机源', verdict: 'pass' }),
  expect.objectContaining({ matrixRow: '用户目录', verdict: 'unknown' }),
  expect.objectContaining({
    matrixRow: '持久化',
    verdict: 'fail',
    evidence: expect.stringContaining('缺少 RxDB 必需能力: queueMicrotask')
  })
];

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
    const asIs = await transform(workerCode, { target: 'esnext', format: 'cjs', supported: { 'object-extensions': false } });
    const lowered = await transform(workerCode, { target: 'es5', format: 'cjs' });
    expect(lowered.code).toBe(asIs.code);
  });

  it('wasm 文件都在代码包里：adapter 默认路径与探针自带的 add.wasm', async () => {
    await expect(readFile(join(outDir, 'wa-sqlite/wa-sqlite.wasm'))).resolves.toHaveProperty('byteLength', expect.any(Number));
    await expect(readFile(join(outDir, 'wasm/add.wasm'))).resolves.toHaveProperty('byteLength', expect.any(Number));
  });

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

  it('iOS 形态：banner 只留记录、Worker 包接线正确；逻辑层没有 queueMicrotask，adapter 预检拒绝打开库', async () => {
    const { report, liveWorkers } = await runDist('ios');
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
    expect(report['prepare']).toMatchObject({ ok: true });
    expect(report['coreLoad']).toMatchObject({ ok: true });
    expect(report['findings']).toEqual(BLOCKED_BY_QUEUE_MICROTASK);
    expect(liveWorkers).toBe(0);
  }, 120_000);

  it('模拟器形态：三路候选都拿不到真实全局对象，prepare 拒绝；核心包顶层撞上 BigInt 缺失', async () => {
    const { report, liveWorkers } = await runDist('simulator');
    const missing = { type: 'undefined', isRealm: false, promiseMatchesFree: false, BigInt: 'n/a', queueMicrotask: 'n/a' };
    expect(report['realmProbe']).toEqual({
      page: {
        before: 'undefined',
        candidates: {
          sloppyThis: missing,
          Function: { type: 'object', isRealm: false, promiseMatchesFree: false, BigInt: 'undefined', queueMicrotask: 'undefined' },
          global: missing
        },
        chosen: null
      },
      core: null
    });
    expect(report['environment']).toMatchObject({ freeGlobals: { globalThis: 'undefined', BigInt: 'undefined' } });
    expect(report['prepare']).toMatchObject({ ok: false, error: { message: expect.stringContaining('拿不到真实全局对象') } });
    expect(report['coreLoad']).toMatchObject({ ok: false, error: { name: 'ReferenceError', message: 'BigInt is not defined' } });
    expect(report['findings']).toEqual([
      expect.objectContaining({ matrixRow: 'WASM', verdict: 'unknown' }),
      expect.objectContaining({ matrixRow: '同步 FS', verdict: 'fail' }),
      expect.objectContaining({ matrixRow: '随机源', verdict: 'fail' }),
      expect.objectContaining({ matrixRow: '用户目录', verdict: 'unknown' }),
      expect.objectContaining({ matrixRow: '持久化', verdict: 'unknown', evidence: expect.stringContaining('BigInt is not defined') })
    ]);
    expect(liveWorkers).toBe(0);
  }, 120_000);

  it('对照：iOS 形态补上 queueMicrotask 后没有别的阻塞点，跑通全部实验', async () => {
    const { report } = await runDist('ios', { hostQueueMicrotask: true });
    expect(report['findings']).toEqual(ALL_PASS);
  }, 120_000);
});
