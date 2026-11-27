import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { checkAppRequirements, reportAppRequirements } from '../../scripts/audit/app-requirements.mjs';

/** 产品根目录在仓库根下一层（`aiao-model-design/`），仓库根要显式给出。 */
const APP = {
  prefix: 'MODEL',
  appRoot: path.resolve(import.meta.dirname, '..'),
  workspaceRoot: path.resolve(import.meta.dirname, '../..')
};

/** 只读校验模型设计器的产品需求，平台故事只校验能力引用，不继承其状态。 */
export function checkRequirements(options = {}) {
  return checkAppRequirements({ ...APP, ...options });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await reportAppRequirements({ ...APP, label: 'Model Design' });
