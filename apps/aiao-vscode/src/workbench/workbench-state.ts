import type { WorkbenchDrafts } from './session.js';

/** 在此浏览器内共享的编辑器偏好。 */
export interface WorkbenchPreferences {
  readonly indentUnit: string;
  readonly alwaysShowScmActions: boolean;
}

/** 项目重开时恢复的标签、草稿和提交说明。 */
export interface WorkbenchProjectState {
  readonly tabs: readonly string[];
  readonly activePath: string | null;
  readonly commitMessage?: string;
  readonly previewTabs?: readonly string[];
  readonly drafts?: WorkbenchDrafts;
}

/** 新用户的编辑器偏好。 */
export const defaultWorkbenchPreferences: WorkbenchPreferences = {
  indentUnit: '  ',
  alwaysShowScmActions: false
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string');
}

function isDrafts(value: unknown): value is WorkbenchDrafts {
  return (
    isRecord(value) &&
    Object.values(value).every(
      draft =>
        isRecord(draft) &&
        typeof draft['content'] === 'string' &&
        (draft['base'] === null || typeof draft['base'] === 'string')
    )
  );
}

/** 校验持久化的项目会话，损坏的数据保留并显式报错。 */
export function parseWorkbenchProjectState(value: unknown): WorkbenchProjectState {
  if (!isRecord(value) || !isStringArray(value['tabs'])) throw new Error('项目会话状态损坏');
  if (value['activePath'] !== null && value['activePath'] !== undefined && typeof value['activePath'] !== 'string')
    throw new Error('项目活动文件状态损坏');
  if (value['previewTabs'] !== undefined && !isStringArray(value['previewTabs']))
    throw new Error('项目预览标签状态损坏');
  if (value['drafts'] !== undefined && !isDrafts(value['drafts'])) throw new Error('项目草稿损坏');
  if (value['commitMessage'] !== undefined && typeof value['commitMessage'] !== 'string')
    throw new Error('项目提交说明状态损坏');
  return {
    tabs: [...value['tabs']],
    activePath: typeof value['activePath'] === 'string' ? value['activePath'] : null,
    ...(value['commitMessage'] === undefined ? {} : { commitMessage: value['commitMessage'] }),
    ...(value['previewTabs'] === undefined ? {} : { previewTabs: [...value['previewTabs']] }),
    ...(value['drafts'] === undefined ? {} : { drafts: value['drafts'] })
  };
}

/** 校验用户偏好，避免损坏的配置被静默覆盖。 */
export function parseWorkbenchPreferences(value: unknown): WorkbenchPreferences {
  if (
    !isRecord(value) ||
    typeof value['indentUnit'] !== 'string' ||
    !['  ', '    ', '        '].includes(value['indentUnit']) ||
    typeof value['alwaysShowScmActions'] !== 'boolean'
  )
    throw new Error('工作台设置损坏');
  return { indentUnit: value['indentUnit'], alwaysShowScmActions: value['alwaysShowScmActions'] };
}
