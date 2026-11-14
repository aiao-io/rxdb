import { writeFileSync } from 'node:fs';
import { arch, cpus, platform, release } from 'node:os';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { outputRoot } from './desktop-server.mjs';
import { initialFootprint } from './harness/chunks.mjs';

const { values } = parseArgs({
  options: {
    'baseline-dist': { type: 'string' },
    'baseline-sha': { type: 'string' },
    'current-sha': { type: 'string' },
    dist: { type: 'string' },
    output: { type: 'string' }
  },
  strict: true
});
for (const name of ['baseline-dist', 'baseline-sha', 'current-sha']) {
  if (!values[name]) throw new Error(`缺少 --${name}`);
}
const baseline = initialFootprint(resolve(values['baseline-dist']));
const current = initialFootprint(values.dist ? resolve(values.dist) : outputRoot);
const report = {
  format: 'aiao-desktop.compare-initial',
  version: 1,
  measuredAt: new Date().toISOString(),
  environment: { os: platform(), release: release(), arch: arch(), cpu: cpus()[0].model, node: process.version },
  buildCommand: 'pnpm nx run aiao-desktop-web:build --configuration=production',
  scope: 'index.html 的脚本静态依赖闭包与样式；逐文件 gzip level 9；不含 HTML、字体、图片、Worker、动态模块与 HTTP 头',
  baseline: { sha: values['baseline-sha'], ...baseline },
  current: { sha: values['current-sha'], ...current },
  checks: { rawDoesNotGrow: current.rawBytes <= baseline.rawBytes, gzipDoesNotGrow: current.gzipBytes <= baseline.gzipBytes },
  change: { rawBytes: current.rawBytes - baseline.rawBytes, gzipBytes: current.gzipBytes - baseline.gzipBytes }
};
const json = `${JSON.stringify(report, null, 2)}\n`;
if (values.output) writeFileSync(resolve(values.output), json);
console.log(json);
if (Object.values(report.checks).some(value => !value)) process.exitCode = 1;
