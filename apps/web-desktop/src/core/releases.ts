import approved from './approved-releases.json' with { type: 'json' };
import { getDefinition, validateManifest } from './catalog.js';
import { requireCondition } from './errors.js';
import type { AppDefinition, Capability, DesktopState, Installation } from './types.js';

export interface AppRelease {
  definition: AppDefinition;
  changes: string[];
  data: { reads: number[]; writes: number; migration: 'none' | 'irreversible' };
}

export function getRelease(appId: string, version: string): AppRelease {
  const definition = getDefinition(appId);
  const item = approved.find(release => release.appId === appId && release.version === version);
  requireCondition(item, 'NOT_FOUND', '应用版本不在批准目录中');
  return {
    definition: validateManifest({
      ...definition,
      version,
      capabilities: item.required as Capability[],
      optionalCapabilities: definition.optionalCapabilities.filter(capability => !item.required.includes(capability))
    }),
    changes: [...item.changes],
    data: { ...item.data, reads: [...item.data.reads], migration: item.data.migration as 'none' }
  };
}

export function latestRelease(appId: string): AppRelease {
  getDefinition(appId);
  const versions = approved.filter(item => item.appId === appId).map(item => item.version);
  versions.sort((left, right) => {
    const a = left.split('.').map(Number);
    const b = right.split('.').map(Number);
    return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
  });
  return getRelease(appId, versions[versions.length - 1]);
}

export function requiredPermissionChanges(current: AppRelease, next: AppRelease): Capability[] {
  return next.definition.capabilities.filter(capability => !current.definition.capabilities.includes(capability));
}

export function validateReleaseData(state: DesktopState, release: AppRelease): void {
  requireCondition(
    release.data.migration === 'none' && release.data.writes === 1,
    'INCOMPATIBLE',
    '此版本需要数据迁移；没有可验证的备份与恢复方案，已阻止更新'
  );
  requireCondition(
    state.appData
      .filter(item => item.appId === release.definition.id)
      .every(item => release.data.reads.includes(item.schemaVersion)),
    'INCOMPATIBLE',
    '此版本无法读取现有应用数据'
  );
}

export function installationFor(state: DesktopState, appId: string): Installation {
  const installation = state.installations.find(item => item.appId === appId);
  requireCondition(installation, 'NOT_FOUND', '应用未安装或已卸载');
  return installation;
}

function compareInstallation(state: DesktopState, appId: string, expected: Installation): Installation {
  const current = installationFor(state, appId);
  requireCondition(
    current.version === expected.version &&
      current.resourceVersion === expected.resourceVersion &&
      current.previousVersion === expected.previousVersion &&
      current.previousResourceVersion === expected.previousResourceVersion,
    'CONFLICT',
    '安装版本已改变，请重新查看应用目录'
  );
  return current;
}

export function switchRelease(
  state: DesktopState,
  appId: string,
  version: string,
  resourceVersion: string,
  expected: Installation
): void {
  const current = compareInstallation(state, appId, expected);
  requireCondition(current.resourceVersion, 'NOT_READY', '旧版本资源尚未固定，无法安全更新');
  requireCondition(/^[a-f0-9]{64}$/.test(resourceVersion), 'INVALID', '资源版本指纹无效');
  requireCondition(current.version !== version, 'INVALID', '已经安装此版本');
  validateReleaseData(state, getRelease(appId, version));
  current.previousVersion = current.version;
  current.previousResourceVersion = current.resourceVersion;
  current.version = version;
  current.resourceVersion = resourceVersion;
}

export function rollbackRelease(state: DesktopState, appId: string, expected: Installation): void {
  const current = compareInstallation(state, appId, expected);
  requireCondition(current.previousVersion && current.previousResourceVersion, 'NOT_FOUND', '没有完整的上一版本可回退');
  validateReleaseData(state, getRelease(appId, current.previousVersion));
  current.version = current.previousVersion;
  current.resourceVersion = current.previousResourceVersion;
  current.previousVersion = null;
  current.previousResourceVersion = null;
}
