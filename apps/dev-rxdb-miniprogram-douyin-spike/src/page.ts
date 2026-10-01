/**
 * @fileoverview 抖音小程序页面入口：打开即跑全部实验，报告打到控制台、显示在页面上，可一键复制。
 *
 * 只引 `/runtime` 与不依赖核心的实验；核心包在 `runSpike` 完成引导之后才 `require`，
 * 这样核心包模块顶层的副作用落在 polyfill 之后，加载失败也只会写进报告。
 */
import type { SpikeCore } from './core-contract.js';
import { describeError } from './describe-error.js';
import type { DouyinApi, DouyinWasmRuntime } from './douyin-api.js';
import type { Finding } from './findings.js';
import { runSpike } from './run-spike.js';

declare const tt: DouyinApi;
declare const TTWebAssembly: DouyinWasmRuntime | undefined;
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

// 字面量路径不能改成变量：抖音的打包器只收录字面量 require 的文件。
// 这是构建产物里的相对路径（dist/spike-core.js），不是工作区项目，边界规则在这里误判。
// eslint-disable-next-line @nx/enforce-module-boundaries
const loadCore = async (): Promise<SpikeCore> => require('../../spike-core.js') as SpikeCore;

Page({
  data: { status: '准备运行', running: false, summary: '', reportText: '' },

  onLoad() {
    void this.runExperiments();
  },

  async runExperiments() {
    if (this.data.running) return;
    this.setData({ status: '实验进行中，配额实验要写满 10M，可能需要一分钟……', running: true, summary: '' });
    try {
      const report = await runSpike({
        tt,
        wasmRuntime: typeof TTWebAssembly === 'undefined' ? undefined : TTWebAssembly,
        loadCore,
        freeGlobals: { tt: typeof tt, TTWebAssembly: typeof TTWebAssembly }
      });
      const reportText = JSON.stringify(report, null, 2);
      console.log('[douyin-spike] 报告：', reportText);
      this.setData({ status: `完成，用时 ${report.durationMs}ms`, summary: summarize(report.findings), reportText });
    } catch (error) {
      const reportText = JSON.stringify({ fatal: describeError(error) }, null, 2);
      console.error('[douyin-spike] 实验没能跑完：', error);
      this.setData({ status: '实验没能跑完，报告里只有致命错误', reportText });
    } finally {
      this.setData({ running: false });
    }
  },

  copyReport() {
    if (typeof tt.setClipboardData !== 'function') {
      this.setData({ status: 'tt.setClipboardData 不存在，请从控制台复制报告' });
      return;
    }
    tt.setClipboardData({
      data: this.data.reportText,
      success: () => this.setData({ status: '报告已复制到剪贴板' }),
      fail: error => this.setData({ status: `复制失败：${describeError(error).text}` })
    });
  }
});
