/**
 * 构建产物冒烟：把 `dist/` 的两个包放进独立的 vm 上下文里跑，和真机一样只有 ECMAScript 内置对象
 * 加上平台注入的 `tt` / `TTWebAssembly` / `Page` / `require`。
 *
 * 源码级测试（run-spike.spec.ts）跑在 Node 全局上，抓不到「打包后的模块顶层副作用」这一类问题。
 */
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createContext, runInContext } from 'node:vm';
import { buildSpike, CORE_REQUEST } from '../scripts/build.mjs';
import { createFakeDouyin } from './__tests__/fake-douyin.js';

interface CapturedPage {
  data: { reportText: string; status: string };
  runExperiments(this: CapturedPage): Promise<void>;
}

interface PageInstance {
  data: Record<string, unknown>;
  setData(patch: Record<string, unknown>): void;
}

/** 平台之外、真机上不一定有的全局；`bare` 模式不补，其余模式补上。 */
const HOST_ENCODING_GLOBALS = { TextDecoder, TextEncoder };

/**
 * - `native`：全局齐全
 * - `bare`：没有 `TextDecoder` / `TextEncoder`
 * - `shadowed-realm-reachable`：包装函数把 `globalThis` 遮成 `undefined`，`global` 是不含内置对象的另一个对象；
 *   包装函数非严格模式，非严格函数的 `this` 能拿到真实全局对象
 * - `shadowed-realm-unreachable`：同上，但包装函数是严格模式、`Function` 构造器被禁用，真实全局对象拿不到
 *
 * 抖音开发者工具实测 `typeof globalThis === 'undefined'`，`global` 是对象但上面没有 `BigInt` / `Promise` 等内置对象；
 * 「遮蔽来自包装函数参数」与真实全局对象能不能拿到，都是**推断**，由报告的 `globalThisShim` 回答
 */
type DistMode = 'native' | 'bare' | 'shadowed-realm-reachable' | 'shadowed-realm-unreachable';

interface WrapperShape {
  readonly prologue: string;
  readonly params: string;
  readonly args: unknown[];
}

/** 各模式下包装函数的严格模式开关与额外形参、实参。 */
function wrapperShape(mode: DistMode, context: object): WrapperShape {
  const globalStub = runInContext('({})', context);
  if (mode === 'shadowed-realm-reachable') {
    // 照模拟器 v4 报告的形态：包装函数连 Promise、Function 也换掉了，Function('return this')() 拿到的是 global 那个空壳
    const wrappedPromise = runInContext('(class WrappedPromise extends Promise {})', context);
    const shadowFunction = runInContext(
      '(stub => function () { return function () { return stub; }; })',
      context
    )(globalStub);
    return {
      prologue: '',
      params: ', globalThis, global, Promise, Function',
      args: [undefined, globalStub, wrappedPromise, shadowFunction]
    };
  }
  if (mode === 'shadowed-realm-unreachable') {
    const disabledFunction = runInContext("(function () { throw new EvalError('Function 构造器被禁用'); })", context);
    return {
      prologue: "'use strict';\n",
      params: ', globalThis, global, Function',
      args: [undefined, globalStub, disabledFunction]
    };
  }
  return { prologue: '', params: '', args: [] };
}

let outDir: string;

beforeAll(async () => {
  outDir = await buildSpike(await mkdtemp(join(tmpdir(), 'douyin-spike-dist-')));
}, 120_000);

afterAll(async () => {
  await rm(outDir, { recursive: true, force: true });
});

/**
 * 模块顶层抛错时 `require` 的行为：`throw` 原样抛出（Node、开发者工具模拟器）；`swallow` 吞掉错误、
 * 返回已经填了一半的 `module.exports`（iOS 真机 v6 报告的形态：核心包导出名齐全，模块顶层的变量却是 `undefined`）。
 */
type InitErrorBehavior = 'throw' | 'swallow';

function evaluateCommonJs(
  code: string,
  context: object,
  require: (path: string) => unknown,
  mode: DistMode,
  onInitError: InitErrorBehavior = 'throw'
): unknown {
  const module = { exports: {} };
  const { prologue, params, args } = wrapperShape(mode, context);
  const source = `(function (module, exports, require${params}) {\n${prologue}${code}\n})`;
  const wrapper = runInContext(source, context) as (
    module: { exports: object },
    exports: object,
    require: (path: string) => unknown,
    ...extras: unknown[]
  ) => void;
  try {
    wrapper(module, module.exports, require, ...args);
  } catch (error) {
    if (onInitError === 'throw') throw error;
  }
  return module.exports;
}

interface DistOptions {
  readonly onCoreInitError?: InitErrorBehavior;
  /** 默认只有 `bare` 模式不补宿主的编码全局。 */
  readonly encodingGlobals?: boolean;
}

async function runDist(mode: DistMode, options: DistOptions = {}): Promise<Record<string, unknown>> {
  const { onCoreInitError = 'throw', encodingGlobals = mode !== 'bare' } = options;
  const fake = createFakeDouyin({ quotaBytes: 3 * 1024 * 1024 });
  let page: CapturedPage | undefined;
  const context = createContext({
    tt: fake.tt,
    TTWebAssembly: fake.wasm,
    console: { log: () => undefined, error: () => undefined, warn: () => undefined },
    // 计时与微任务属于宿主全局，不在 ECMAScript 内置对象里；真机有没有 queueMicrotask 由报告的 globals 回答
    setTimeout,
    clearTimeout,
    queueMicrotask,
    Page: (options: CapturedPage) => {
      page = options;
    },
    ...(encodingGlobals ? HOST_ENCODING_GLOBALS : {})
  });
  const coreCode = await readFile(join(outDir, 'spike-core.js'), 'utf8');
  const pageCode = await readFile(join(outDir, 'pages/index/index.js'), 'utf8');
  const requireFromPage = (path: string): unknown => {
    if (path !== CORE_REQUEST) throw new Error(`页面包 require 了意料之外的路径：${path}`);
    return evaluateCommonJs(coreCode, context, requireFromPage, mode, onCoreInitError);
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
  return JSON.parse(String(instance.data['reportText'])) as Record<string, unknown>;
}

describe('dist 冒烟', () => {
  it('页面包只以字面量路径引用核心包', async () => {
    const pageCode = await readFile(join(outDir, 'pages/index/index.js'), 'utf8');
    expect(pageCode).toContain(`require("${CORE_REQUEST}")`);
    expect(pageCode).not.toMatch(/createWaSqliteMiniProgramClient/);
  });

  it('有原生 TextDecoder 时，打包产物跑通全部实验', async () => {
    const report = await runDist('native');
    expect(report['coreLoad']).toMatchObject({ ok: true });
    expect(report['findings']).toEqual(
      ['WASM', '同步 FS', '随机源', '用户目录', '持久化'].map(matrixRow =>
        expect.objectContaining({ matrixRow, verdict: 'pass' })
      )
    );
  }, 120_000);

  it('没有原生 TextDecoder 时，latin1 垫片顶替 adapter polyfill 解 latin1，① ④ 跑通且经核心包的行标明前提', async () => {
    // sqlite-core 的 sqlite-blank-database.ts 顶层 new TextDecoder('latin1')，adapter 的 polyfill 只认 utf-8 / utf-16le；
    // 不垫时核心包在模块顶层 RangeError（iOS 真机 v6）。垫片只在委托拒绝 latin1 时顶上
    const report = await runDist('bare');
    expect(report['coreLoad']).toMatchObject({ ok: true });
    expect(report['latin1Shim']).toEqual({ engaged: 1, delegateError: expect.stringContaining('latin1') });
    expect(report['findings']).toEqual([
      expect.objectContaining({ matrixRow: 'WASM', verdict: 'pass', evidence: expect.stringContaining('latin1 垫片') }),
      expect.objectContaining({ matrixRow: '同步 FS', verdict: 'pass', evidence: expect.not.stringContaining('垫片') }),
      expect.objectContaining({ matrixRow: '随机源', verdict: 'pass', evidence: expect.not.stringContaining('垫片') }),
      expect.objectContaining({
        matrixRow: '用户目录',
        verdict: 'pass',
        evidence: expect.stringContaining('latin1 垫片')
      }),
      expect.objectContaining({
        matrixRow: '持久化',
        verdict: 'pass',
        evidence: expect.stringContaining('latin1 垫片')
      })
    ]);
  }, 120_000);

  it('平台 require 吞掉核心包顶层错误时，coreLoad 照样报出原始错误，而不是半成品导出引发的次生错误', async () => {
    // 拿不到真实全局对象 → prepare 失败、polyfill 没装；宿主又没有 TextDecoder → 核心包顶层 ReferenceError。
    // 垫片不凭空造 TextDecoder，这个错误必须原样穿过
    const report = await runDist('shadowed-realm-unreachable', { encodingGlobals: false, onCoreInitError: 'swallow' });
    expect(report['prepare']).toMatchObject({ ok: false });
    expect(report['coreLoad']).toMatchObject({
      ok: false,
      error: { name: 'ReferenceError', message: expect.stringContaining('TextDecoder') }
    });
    expect(report['core']).toEqual({ skipped: expect.stringContaining('TextDecoder') });
    expect(report['latin1Shim']).toBeNull();
  }, 120_000);

  it('全局正常时 banner 不动 globalThis，只留记录', async () => {
    const report = await runDist('native');
    const untouched = { before: 'object', candidates: {}, chosen: null, applied: false };
    expect(report['globalThisShim']).toEqual({ page: untouched, core: untouched });
    expect(report['latin1Shim']).toEqual({ engaged: 0, delegateError: null });
    expect(JSON.stringify(report['findings'])).not.toContain('垫片');
  }, 120_000);

  it('globalThis 被遮、真实全局对象拿得到时，两个包各自换上它并记录，① ④ 照常跑通', async () => {
    const report = await runDist('shadowed-realm-reachable');
    const shimmed = {
      before: 'undefined',
      chosen: 'sloppyThis',
      applied: true,
      candidates: expect.objectContaining({
        // 自由变量 Promise 被包装函数换掉，不能拿它判真实全局对象
        sloppyThis: expect.objectContaining({ isRealm: true, promiseMatchesFree: false, BigInt: 'function' }),
        Function: expect.objectContaining({ type: 'object', isRealm: false, BigInt: 'undefined' }),
        global: expect.objectContaining({ type: 'object', isRealm: false, BigInt: 'undefined' })
      })
    };
    expect(report['globalThisShim']).toEqual({ page: shimmed, core: shimmed });
    expect(report['environment']).toMatchObject({ residue: false });
    expect(report['prepare']).toMatchObject({ ok: true });
    expect(report['coreLoad']).toMatchObject({ ok: true });
    // 垫片下的通过不等于 adapter 现状可用：除了不经 adapter 的同步 FS，证据都要标明前提
    expect(report['findings']).toEqual([
      expect.objectContaining({ matrixRow: 'WASM', verdict: 'pass', evidence: expect.stringContaining('垫片') }),
      expect.objectContaining({ matrixRow: '同步 FS', verdict: 'pass', evidence: expect.not.stringContaining('垫片') }),
      expect.objectContaining({ matrixRow: '随机源', verdict: 'pass', evidence: expect.stringContaining('垫片') }),
      expect.objectContaining({ matrixRow: '用户目录', verdict: 'pass', evidence: expect.stringContaining('垫片') }),
      expect.objectContaining({ matrixRow: '持久化', verdict: 'pass', evidence: expect.stringContaining('垫片') })
    ]);
  }, 120_000);

  it('真实全局对象拿不到时不垫，报告照样出完整，并记下每条路为什么不通', async () => {
    const report = await runDist('shadowed-realm-unreachable');
    expect(report).not.toHaveProperty('fatal');
    const unshimmed = {
      before: 'undefined',
      chosen: null,
      applied: false,
      candidates: {
        sloppyThis: expect.objectContaining({ type: 'undefined', isRealm: false }),
        Function: { error: expect.stringContaining('Function 构造器被禁用') },
        global: expect.objectContaining({ type: 'object', isRealm: false })
      }
    };
    expect(report['globalThisShim']).toEqual({ page: unshimmed, core: unshimmed });
    expect(report['environment']).toMatchObject({
      freeGlobals: { globalThis: 'undefined', TextDecoder: 'function', queueMicrotask: 'function' },
      globalObject: { ok: false, error: { name: 'TypeError' } },
      textDecoderLabels: { latin1: { ok: true } }
    });
    // 现状刻画：adapter 的引导全靠 globalThis，拿不到全局对象时 prepare 直接失败
    expect(report['prepare']).toMatchObject({ ok: false, error: { name: 'TypeError' } });
    expect(JSON.stringify(report['findings'])).not.toContain('垫片');
  }, 120_000);
});
