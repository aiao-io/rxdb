/**
 * @fileoverview 支付宝小程序页面入口：打开即跑全部实验，报告打到控制台、显示在页面上，可一键复制。
 *
 * 只引 `/runtime` 与不依赖核心的实验；核心包在 `runProbe` 完成引导之后才 `require`，
 * 这样核心包模块顶层的副作用落在 polyfill 之后，加载失败也只会写进报告。
 */
import type { AlipayApi } from './alipay-api.js';
import type { ProbeCore } from './core-contract.js';
import { describeError } from './describe-error.js';
import type { Finding } from './findings.js';
import { captureFreeGlobals } from './free-globals.js';
import { runProbe } from './run-probe.js';
import type { WasmFingerprints } from './wasm-fingerprint.js';

declare const my: AlipayApi;
/** 构建脚本经 esbuild `define` 注入的代码包 wasm 指纹，名字与 `scripts/build.mjs` 的 `WASM_FINGERPRINTS_VAR` 一致。 */
declare const __aiaoSpikeWasmFingerprints: WasmFingerprints;
declare function require(path: string): unknown;
declare function Page(options: PageOptions & ThisType<PageInstance>): void;

interface PageData {
  status: string;
  running: boolean;
  summary: string;
  reportText: string;
}

interface PageInstance {
  readonly data: PageData;
  setData(data: Partial<PageData>): void;
  runExperiments(): Promise<void>;
}

interface PageOptions {
  data: PageData;
  onLoad(): void;
  runExperiments(): Promise<void>;
  copyReport(): void;
}

const VERDICT_ICONS: Record<Finding['verdict'], string> = { pass: '✅', fail: '❌', unknown: '⚠️' };

function summarize(findings: readonly Finding[]): string {
  return findings.map(item => `${VERDICT_ICONS[item.verdict]} ${item.matrixRow}\n${item.evidence}`).join('\n\n');
}

// 字面量路径不能改成变量：小程序打包器只收录字面量 require 的文件。
// 这是构建产物里的相对路径（dist/probe-core.js），不是工作区项目，边界规则在这里误判。
// eslint-disable-next-line @nx/enforce-module-boundaries
const loadCore = async (): Promise<ProbeCore> => require('../../probe-core.js') as ProbeCore;

Page({
  data: { status: '准备运行', running: false, summary: '', reportText: '' },

  onLoad() {
    void this.runExperiments();
  },

  async runExperiments() {
    if (this.data.running) return;
    this.setData({ status: '实验进行中，配额实验要写满 50M，可能需要一两分钟……', running: true, summary: '' });
    try {
      const report = await runProbe({
        my,
        wasm: typeof WebAssembly === 'undefined' ? undefined : WebAssembly,
        wasmFingerprints: __aiaoSpikeWasmFingerprints,
        loadCore,
        freeGlobals: captureFreeGlobals()
      });
      const reportText = JSON.stringify(report, null, 2);
      console.log('[alipay-probe] 报告：', reportText);
      this.setData({ status: `完成，用时 ${report.durationMs}ms`, summary: summarize(report.findings), reportText });
    } catch (error) {
      const reportText = JSON.stringify({ fatal: describeError(error) }, null, 2);
      console.error('[alipay-probe] 实验没能跑完：', error);
      this.setData({ status: '实验没能跑完，报告里只有致命错误', reportText });
    } finally {
      this.setData({ running: false });
    }
  },

  copyReport() {
    if (typeof my.setClipboard !== 'function') {
      this.setData({ status: 'my.setClipboard 不存在，请从控制台复制报告' });
      return;
    }
    my.setClipboard({
      text: this.data.reportText,
      success: () => this.setData({ status: '报告已复制到剪贴板' }),
      fail: error => this.setData({ status: `复制失败：${describeError(error).text}` })
    });
  }
});
