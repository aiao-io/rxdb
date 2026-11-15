import { createRequire } from 'node:module';

import { prepareVendor, VENDOR_TOOLS } from './prepare.mjs';
import { prepareRuntimes, RUNTIME_ASSETS } from './runtimes.mjs';
import manifest from './tools.json' with { type: 'json' };

const require = createRequire(import.meta.url);
const { version } = require('@vivari/core/package.json');
if (version !== manifest.vivariVersion)
  throw new Error(`Vivari 版本 ${version} 与 vendor 清单 ${manifest.vivariVersion} 不匹配，先核对上游格式与工具版本`);
await prepareVendor();
await prepareRuntimes();
console.log(`Vivari ${version} 终端资源就绪：${VENDOR_TOOLS.map(tool => `${tool.name}@${tool.version}`).join('、')}，${RUNTIME_ASSETS.length} 个运行时资源`);
