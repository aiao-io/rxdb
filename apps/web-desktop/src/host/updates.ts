import { requireCondition } from '../core/errors.js';
import { grantPermission } from '../core/permissions.js';
import {
  getRelease,
  installationFor,
  latestRelease,
  requiredPermissionChanges,
  rollbackRelease,
  switchRelease,
  validateReleaseData
} from '../core/releases.js';
import type { DesktopState, SavedWindow } from '../core/types.js';
import type { DesktopHost, RunningApp } from './runtime.js';
import { saveWindow } from './windows.js';

function captureWindows(host: DesktopHost, appId: string): { app: RunningApp; saved: SavedWindow | undefined }[] {
  return [...host.instances.values()]
    .filter(app => app.definition.id === appId)
    .map(app => {
      const win = host.model.windows.find(item => item.instanceId === app.id);
      return {
        app,
        saved: win ? saveWindow(win, app.fileId, app.route) : undefined
      };
    });
}

export async function changeApplication(
  host: DesktopHost,
  appId: string,
  rollback: boolean,
  signal?: AbortSignal,
  guard: (state: DesktopState) => void = () => undefined
): Promise<boolean> {
  requireCondition(!host.changingApplications.has(appId), 'BUSY', '此应用正在更新或卸载');
  host.changingApplications.add(appId);
  host.prefetch.cancel(appId);
  try {
    return await performChange(host, appId, rollback, signal, guard);
  } finally {
    host.changingApplications.delete(appId);
    host.applicationsChanged(appId);
    host.changed();
  }
}

async function performChange(
  host: DesktopHost,
  appId: string,
  rollback: boolean,
  signal: AbortSignal | undefined,
  guard: (state: DesktopState) => void
): Promise<boolean> {
  const expected = structuredClone(installationFor(host.state, appId));
  const current = getRelease(appId, expected.version);
  requireCondition(
    !rollback || (expected.previousVersion && expected.previousResourceVersion),
    'NOT_FOUND',
    '没有完整的上一版本可回退'
  );
  const next = rollback ? getRelease(appId, expected.previousVersion!) : latestRelease(appId);
  requireCondition(next.definition.version !== current.definition.version, 'INVALID', '已经安装此版本');
  validateReleaseData(host.state, next);
  const added = requiredPermissionChanges(current, next);
  const choice = await host.dialogs.ask(
    {
      title: `${rollback ? '回退' : '更新'} ${current.definition.name}`,
      message: `${current.definition.version} → ${next.definition.version}\n${next.changes.join('\n')}\n新增必需权限：${added.join('、') || '无'}\n数据兼容：读取版本 ${next.data.reads.join('、')}，写入版本 ${next.data.writes}，无需迁移。共享文件和应用私有数据保留。下载完整校验后再协商关闭；取消会保留当前工作。`,
      actions: [
        { id: 'continue', label: rollback ? '准备回退' : '下载并继续' },
        { id: 'cancel', label: '稍后' }
      ]
    },
    signal
  );
  if (choice.action !== 'continue') return false;
  if (!rollback && expected.resourceVersion === null) {
    await host.prepareApplication(appId, { signal });
    expected.resourceVersion = installationFor(host.state, appId).resourceVersion;
  }
  const key = rollback ? expected.previousResourceVersion! : host.resources.find(appId, next.definition.version).key;
  const release = host.resources.hold({ appId, version: next.definition.version, key });
  try {
    await host.resources.prepare({ appId, version: next.definition.version, key }, { signal });
    if (added.length > 0) {
      const permission = await host.dialogs.ask(
        {
          title: '新增必需权限',
          message: `${next.definition.name} ${next.definition.version}\n来源：${host.baseURL().origin}\n新增能力：${added.join('、')}\n范围：此应用的相关桌面服务。旧授权不会自动扩展；拒绝将保留旧版本。`,
          actions: [
            { id: 'allow', label: '允许新增权限并继续' },
            { id: 'cancel', label: '拒绝，保留旧版本' }
          ]
        },
        signal
      );
      if (permission.action !== 'allow') return false;
    }
    requireCondition(!signal?.aborted, 'CANCELLED', '版本切换已取消');
    guard(host.state);
    const captured = captureWindows(host, appId);
    if (!(await host.closeInstances(captured.map(item => item.app.id)))) return false;
    await host.mutate(state => {
      requireCondition(!signal?.aborted, 'CANCELLED', '版本切换已取消');
      guard(state);
      if (rollback) rollbackRelease(state, appId, expected);
      else switchRelease(state, appId, next.definition.version, key, expected);
      for (const capability of added)
        grantPermission(
          state,
          {
            appId,
            instanceId: 'release-switch',
            origin: host.baseURL().origin,
            capabilities: next.definition.capabilities
          },
          capability,
          '*',
          true
        );
    });
    host.changingApplications.delete(appId);
    for (const item of captured)
      host.launch(appId, true, item.app.fileId, item.saved ? { ...item.saved, fileId: item.app.fileId } : undefined);
    await host.persistSession();
    return true;
  } finally {
    release();
  }
}
