import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { checkAppRequirements, reportAppRequirements } from '../../scripts/audit/app-requirements.mjs';

/** 产品根目录在仓库根下一层（`aiao-desktop/`），仓库根要显式给出。 */
const APP = {
  prefix: 'ADESK',
  appRoot: path.resolve(import.meta.dirname, '..'),
  workspaceRoot: path.resolve(import.meta.dirname, '../..')
};

/**
 * 只读校验 Aiao Desktop 的产品需求；平台故事只校验能力引用，不继承其状态。
 *
 * @param options 覆盖默认的 `appRoot` / `workspaceRoot`（测试夹具用）
 */
export function checkRequirements(options = {}) {
  return checkAppRequirements({ ...APP, ...options });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await reportAppRequirements({ ...APP, label: 'Aiao Desktop' });
