/**
 * 全量 packages/ 运行时条件审计：遍历所有包，检查 package.json 中是否有
 * 非标准的 exports conditions（如 react-native、browser 外的字段）。
 */

import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const packagesRoot = path.resolve('packages');
const offenders = [];

for (const entry of await readdir(packagesRoot, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;

  const manifestPath = path.join(packagesRoot, entry.name, 'package.json');
  let packageJson;
  try {
    packageJson = JSON.parse(await readFile(manifestPath, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') continue;
    throw error;
  }

  const visit = (value, condition = '') => {
    if (typeof value === 'string') {
      if (condition !== 'types' && /\.[cm]?tsx?$/.test(value)) {
        offenders.push(`${packageJson.name}:${condition || 'export'} -> ${value}`);
      }
      return;
    }
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) visit(child, key);
  };

  visit(packageJson.exports);
}

assert.deepEqual(offenders, [], `Non-executable package export conditions:\n${offenders.join('\n')}`);
process.stdout.write('Package runtime conditions passed.\n');
