import type { OrbitValue } from '@aiao/orbit';
import {
  decodeBase64,
  encodeBase64,
  type DesktopWorkspaceClient,
  type DesktopWorkspaceRequest
} from '@aiao/orbit/desktop';
import { decodeFileBytes, encodeFileBytes } from './git/file-encoding.js';
import type {
  WorkbenchBackend,
  WorkbenchCommit,
  WorkbenchDiff,
  WorkbenchSnapshot,
  WorkbenchStatus
} from './session.js';

function snapshot(value: OrbitValue): WorkbenchSnapshot {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    typeof value['projectId'] !== 'string' ||
    !Number.isSafeInteger(value['revision']) ||
    !Array.isArray(value['files'])
  )
    throw new Error('桌面工作区快照无效');
  const files = Object.fromEntries(
    value['files'].map(item => {
      if (
        !item ||
        typeof item !== 'object' ||
        Array.isArray(item) ||
        typeof item['bytes'] !== 'string' ||
        typeof item['path'] !== 'string'
      )
        throw new Error('桌面文件数据无效');
      return [item['path'], decodeFileBytes(item['path'], decodeBase64(item['bytes']))];
    })
  );
  return { projectId: value['projectId'], revision: String(value['revision']), files };
}

/** 编辑已绑定的桌面仓库。归档与创建仓库由用户在 GitHub Desktop 中执行。 */
export function desktopWorkspaceBackend(client: DesktopWorkspaceClient): WorkbenchBackend {
  const call = (request: DesktopWorkspaceRequest) => client.call(request);
  const manage = (): Promise<never> => Promise.reject(new Error('请在 GitHub Desktop 中管理仓库或归档'));
  return {
    open: id => call({ projectId: id, operation: 'open' }).then(snapshot),
    create: manage,
    save: (id, files, revision, removedPaths) =>
      call({
        projectId: id,
        operation: 'save',
        files: Object.entries(files).map(([path, value]) => ({ path, base64: encodeBase64(encodeFileBytes(value)) })),
        expectedRevision: Number(revision),
        removedPaths
      }).then(snapshot),
    remove: async (id, path) => {
      await call({ projectId: id, operation: 'remove', path });
    },
    rename: async (id, path, destination) => {
      await call({ projectId: id, operation: 'rename', path, destination });
    },
    move: async (id, path, destination) => {
      await call({ projectId: id, operation: 'move', path, destination });
    },
    status: async id => (await call({ projectId: id, operation: 'status' })) as unknown as WorkbenchStatus,
    stage: async (id, paths) => {
      await call({ projectId: id, operation: 'stage', paths });
    },
    unstage: async (id, paths) => {
      await call({ projectId: id, operation: 'unstage', paths });
    },
    readDiff: async (id, path, kind) =>
      (await call({ projectId: id, operation: 'readDiff', path, kind })) as unknown as WorkbenchDiff,
    discardWorking: (id, path) => call({ projectId: id, operation: 'discardWorking', path }).then(snapshot),
    commit: async (id, message) => {
      const oid = await call({ projectId: id, operation: 'commit', message });
      if (typeof oid !== 'string') throw new Error('桌面提交结果无效');
      return oid;
    },
    pull: id => call({ projectId: id, operation: 'pull' }).then(snapshot),
    history: async id => (await call({ projectId: id, operation: 'history' })) as unknown as readonly WorkbenchCommit[],
    restore: (id, oid) => call({ projectId: id, operation: 'restore', oid }).then(snapshot),
    exportArchive: manage,
    importArchive: manage,
    dispose() {
      /* 生命周期由桌面窗口管理。 */
    }
  };
}
