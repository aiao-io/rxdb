/**
 * 再生冒烟键基线：跑全部默认检查组，把输出键写进 `smoke-keys-85b86fb3.json`。
 * `benchmark-smoke` 对基线之外的键（extra）硬失败，新增默认检查组后必须先跑本脚本再生基线再合入（ADESK-US-132 阶段 1）。
 *
 * 用法（在 apps/e2e 目录）：node src/baseline/regenerate.mjs [--parallel=1]
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { flattenKeys } from '../harness/keys.mjs';

const parallel = process.argv.includes('--parallel=1') ? ['--parallel=1'] : [];
const smokeUrl = new URL('../smoke.mjs', import.meta.url);
const output = execFileSync(process.execPath, [fileURLToPath(smokeUrl), ...parallel], { encoding: 'utf8' });
const checks = JSON.parse(output.trim());
const keys = flattenKeys(checks);
writeFileSync(new URL('./smoke-keys-85b86fb3.json', import.meta.url), `${JSON.stringify({ keys }, null, 2)}\n`);
console.log(`baseline updated with ${keys.length} keys`);
