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

/** 平台之外、真机上不一定有的全局；`native` 模式补上，`bare` 模式不补。 */
const HOST_ENCODING_GLOBALS = { TextDecoder, TextEncoder };

let outDir: string;

beforeAll(async () => {
  outDir = await buildSpike(await mkdtemp(join(tmpdir(), 'douyin-spike-dist-')));
}, 120_000);

afterAll(async () => {
  await rm(outDir, { recursive: true, force: true });
});

function evaluateCommonJs(code: string, context: object, require: (path: string) => unknown): unknown {
  const module = { exports: {} };
  const wrapper = runInContext(`(function (module, exports, require) {\n${code}\n})`, context) as (
    module: { exports: object },
    exports: object,
    require: (path: string) => unknown
  ) => void;
  wrapper(module, module.exports, require);
  return module.exports;
}

async function runDist(mode: 'native' | 'bare'): Promise<Record<string, unknown>> {
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
    ...(mode === 'native' ? HOST_ENCODING_GLOBALS : {})
  });
  const coreCode = await readFile(join(outDir, 'spike-core.js'), 'utf8');
  const pageCode = await readFile(join(outDir, 'pages/index/index.js'), 'utf8');
  const requireFromPage = (path: string): unknown => {
    if (path !== CORE_REQUEST) throw new Error(`页面包 require 了意料之外的路径：${path}`);
    return evaluateCommonJs(coreCode, context, requireFromPage);
  };
  evaluateCommonJs(pageCode, context, requireFromPage);
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

  it('没有原生 TextDecoder 时，核心包在模块顶层被 latin1 卡住', async () => {
    // 现状刻画：sqlite-core 的 sqlite-blank-database.ts 顶层 new TextDecoder('latin1')，
    // adapter 的 polyfill 只认 utf-8 / utf-16le。修好之后这条应当翻转成全部通过。
    const report = await runDist('bare');
    expect(report['coreLoad']).toMatchObject({
      ok: false,
      error: { name: 'RangeError', message: expect.stringContaining('latin1') }
    });
    expect(report['core']).toEqual({ skipped: expect.stringContaining('latin1') });
    expect(report['random']).toMatchObject({ '65536': { ok: true } });
  }, 120_000);
});
