import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { checkAppRequirements, reportAppRequirements } from '../../../scripts/audit/app-requirements.mjs';

const APP = { prefix: 'MODEL', appRoot: path.resolve(import.meta.dirname, '..') };

/** 只读校验模型设计器的应用需求，平台故事只校验能力引用，不继承其状态。 */
export function checkRequirements(options = {}) {
  return checkAppRequirements({ ...APP, ...options });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await reportAppRequirements({ ...APP, label: 'Model Design' });
