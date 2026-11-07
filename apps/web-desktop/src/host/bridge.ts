import type { OrbitValue } from '@aiao/orbit';
import { exportBackup, validateBackup } from '../core/backup.js';
import { decodedByteLength } from '../core/bytes.js';
import { builtins, getDefinition, installApp, isRecord, uninstallApp } from '../core/catalog.js';
import { requireCondition } from '../core/errors.js';
import {
  createFile,
  deleteFile,
  emptyTrash,
  findFile,
  importFiles,
  listFiles,
  moveFile,
  readFile,
  renameFile,
  restoreFile,
  trashFile,
  validateImport,
  writeFile,
  type FileInput,
  type ImportInput
} from '../core/files.js';
import { checkPermission, grantPermission, revokePermission } from '../core/permissions.js';
import { getRelease, latestRelease } from '../core/releases.js';
import { normalizeRoute, readNavigationState } from '../core/routes.js';
import { isJson } from '../core/session.js';
import { createState, defaultProfile } from '../core/state.js';
import type { DesktopState, Json, Profile } from '../core/types.js';
import { reorderWorkspaces } from '../core/workspaces.js';
import { diagnostics } from './diagnostics.js';
import type { DesktopHost, RunningApp } from './runtime.js';
import { changeApplication } from './updates.js';

function text(data: Record<string, unknown>, key: string): string {
  const value = data[key];
  requireCondition(typeof value === 'string', 'INVALID', `${key} 必须为文本`);
  return value;
}
function nullableText(data: Record<string, unknown>, key: string): string | null {
  if (data[key] === null || data[key] === undefined) return null;
  return text(data, key);
}
function json(value: unknown): Json {
  requireCondition(isJson(value), 'INVALID', '响应不是有效 JSON');
  return value;
}
function fileInput(data: Record<string, unknown>): FileInput {
  for (const field of ['mime', 'bytes'])
    requireCondition(data[field] === undefined || typeof data[field] === 'string', 'INVALID', `${field} 必须为文本`);
  requireCondition(
    data['kind'] === undefined || data['kind'] === 'file' || data['kind'] === 'directory',
    'INVALID',
    '文件类型无效'
  );
  return {
    name: text(data, 'name'),
    parentId: nullableText(data, 'parentId'),
    kind: data['kind'] === 'directory' ? 'directory' : 'file',
    mime: typeof data['mime'] === 'string' ? data['mime'] : undefined,
    bytes: typeof data['bytes'] === 'string' ? data['bytes'] : ''
  };
}

export function registerBridge(host: DesktopHost, app: RunningApp): void {
  const identity = host.identity(app);
  async function read<T>(
    capability: string,
    scope: string,
    operation: (state: DesktopState) => T,
    signal: AbortSignal
  ): Promise<T> {
    await host.authorize(app, capability, scope, signal);
    requireCondition(host.database && host.ownership.owned && !signal.aborted, 'OWNERSHIP', '桌面控制权已失效');
    const state = await host.database.read();
    requireCondition(
      host.instances.get(app.id) === app && host.ownership.owned && !signal.aborted,
      'OWNERSHIP',
      '读取期间桌面控制权已失效'
    );
    requireCondition(checkPermission(state, identity, capability, scope), 'DENIED', '授权已撤销');
    return operation(state);
  }
  async function write<T>(
    capability: string,
    scope: string,
    operation: (state: DesktopState) => T,
    signal: AbortSignal
  ): Promise<T> {
    await host.authorize(app, capability, scope, signal);
    return host.mutate(state => {
      requireCondition(
        !signal.aborted && checkPermission(state, identity, capability, scope),
        'DENIED',
        '调用已取消或授权已撤销'
      );
      return operation(state);
    });
  }
  const methods: Record<string, (data: Record<string, unknown>, signal: AbortSignal) => unknown | Promise<unknown>> = {
    'desktop.context': () => ({
      appId: app.definition.id,
      instanceId: app.id,
      profile: host.state.profile,
      workspaceId: host.model.workspaceId,
      offline: host.offline,
      offlineReady: host.offlineReady,
      version: app.definition.version
    }),
    'desktop.confirm': async (data, signal) => {
      const result = await host.dialogs.ask(
        {
          title: `${app.definition.name} · ${text(data, 'title')}`,
          message: text(data, 'message'),
          actions: [
            { id: 'yes', label: '确认' },
            { id: 'cancel', label: '取消' }
          ]
        },
        signal
      );
      return result.action === 'yes';
    },
    'desktop.prompt': async (data, signal) => {
      const result = await host.dialogs.ask(
        {
          title: `${app.definition.name} · ${text(data, 'title')}`,
          message: '',
          fields: [{ name: 'text', label: text(data, 'label'), value: text(data, 'value') }],
          actions: [
            { id: 'yes', label: '确认' },
            { id: 'cancel', label: '取消' }
          ]
        },
        signal
      );
      return result.action === 'yes' ? result.values['text'] : null;
    },
    'desktop.saveFile': async (data, signal) => {
      const answer = await host.dialogs.ask(
        {
          title: '保存文档到桌面文件',
          message: '选择浏览器内的目标目录与名称。取消会保留未保存内容。',
          fields: [
            { name: 'name', label: '保存文件名', value: text(data, 'name') },
            {
              name: 'target',
              label: '保存目录',
              value: nullableText(data, 'parentId') ?? 'root',
              options: [
                { value: 'root', label: '我的文件' },
                ...host.state.files
                  .filter(dir => !dir.deleted && dir.kind === 'directory')
                  .map(dir => ({ value: dir.id, label: dir.name }))
              ]
            }
          ],
          actions: [
            { id: 'save', label: '保存到此位置' },
            { id: 'cancel', label: '取消' }
          ]
        },
        signal
      );
      return answer.action === 'save' ?
          { name: answer.values['name'], parentId: answer.values['target'] === 'root' ? null : answer.values['target'] }
        : null;
    },
    'desktop.selectDirectory': async (data, signal) => {
      const dirs = await read(
        'files',
        '*',
        state => state.files.filter(file => !file.deleted && file.kind === 'directory'),
        signal
      );
      const result = await host.dialogs.ask(
        {
          title: `${app.definition.name} · ${text(data, 'title')}`,
          message: '选择目标目录',
          fields: [
            {
              name: 'target',
              label: '目录',
              value: nullableText(data, 'value') ?? 'root',
              options: [{ value: 'root', label: '我的文件' }, ...dirs.map(dir => ({ value: dir.id, label: dir.name }))]
            }
          ],
          actions: [
            { id: 'yes', label: '确认' },
            { id: 'cancel', label: '取消' }
          ]
        },
        signal
      );
      return result.action === 'yes' ? result.values['target'] : null;
    },
    'desktop.chooseWorkspace': async (data, signal) => {
      const result = await host.dialogs.ask(
        {
          title: '删除并迁移工作区',
          message: '窗口及其未保存内容将迁移到所选工作区。取消不会改变布局。',
          fields: [
            {
              name: 'target',
              label: '迁移到',
              value: '',
              options: host.state.workspaces
                .filter(workspace => workspace.id !== text(data, 'exclude'))
                .map(workspace => ({ value: workspace.id, label: workspace.name }))
            }
          ],
          actions: [
            { id: 'yes', label: '确认' },
            { id: 'cancel', label: '取消' }
          ]
        },
        signal
      );
      return result.action === 'yes' ? result.values['target'] : null;
    },
    'desktop.shortcut': data => host.shortcut(text(data, 'key')),
    'window.focus': () => {
      host.reveal(app.id);
      return true;
    },
    'window.update': async data => {
      const route = data['route'] === undefined ? app.route : normalizeRoute(data['route']);
      const flags = data['navigation'];
      requireCondition(flags === undefined || isRecord(flags), 'INVALID', '导航状态无效');
      const navigation = flags === undefined ? app.navigation : readNavigationState({ ...flags, route });
      if (typeof data['title'] === 'string') app.title = data['title'].slice(0, 256);
      if (typeof data['dirty'] === 'boolean') app.dirty = data['dirty'];
      if (data['fileId'] === null || typeof data['fileId'] === 'string') app.fileId = data['fileId'];
      app.route = route;
      app.navigation = { back: navigation.back, forward: navigation.forward };
      if (Array.isArray(data['commands']))
        app.commands = data['commands'].map(command => {
          requireCondition(
            isRecord(command) &&
              typeof command['id'] === 'string' &&
              typeof command['label'] === 'string' &&
              typeof command['disabled'] === 'boolean',
            'INVALID',
            '菜单命令无效'
          );
          return { id: command['id'], label: command['label'], disabled: command['disabled'] };
        });
      const win = host.model.windows.find(win => win.instanceId === app.id);
      if (win) win.title = app.title;
      host.changed();
      await host.persistSession();
      return true;
    },
    'window.action': async data => {
      await host.windowAction(app.id, text(data, 'action'));
      return true;
    },
    'files.list': (data, signal) =>
      read(
        'files',
        '*',
        state =>
          listFiles(
            state,
            nullableText(data, 'parentId'),
            typeof data['search'] === 'string' ? data['search'] : '',
            data['trash'] === true
          ).map(file => ({ ...file, bytes: '', size: decodedByteLength(file.bytes) })),
        signal
      ),
    'files.directories': (_data, signal) =>
      read(
        'files',
        '*',
        state =>
          state.files.filter(file => !file.deleted && file.kind === 'directory').map(file => ({ ...file, bytes: '' })),
        signal
      ),
    'files.read': (data, signal) => read('files', text(data, 'id'), state => readFile(state, text(data, 'id')), signal),
    'files.create': async (data, signal) => {
      const input = fileInput(data);
      const scope = `directory:${input.parentId ?? 'root'}`;
      const result = await write(
        'files',
        scope,
        state => {
          const file = createFile(state, input);
          const parentGrant = state.grants.find(
            grant =>
              grant.appId === identity.appId &&
              grant.origin === identity.origin &&
              grant.capability === 'files' &&
              (grant.scope === '*' || grant.scope === scope) &&
              (grant.instanceId === null || grant.instanceId === app.id)
          );
          requireCondition(parentGrant, 'DENIED', '目录授权已撤销');
          grantPermission(state, identity, 'files', file.id, parentGrant.instanceId === null);
          return file;
        },
        signal
      );
      host.notifyFiles(app.id);
      return result;
    },
    'files.write': async (data, signal) => {
      requireCondition(
        typeof data['revision'] === 'number' && Number.isSafeInteger(data['revision']),
        'INVALID',
        '缺少文件版本'
      );
      const revision = data['revision'];
      const result = await write(
        'files',
        text(data, 'id'),
        state => {
          const file = writeFile(state, text(data, 'id'), revision, text(data, 'bytes'));
          if (typeof data['name'] === 'string' && data['name'] !== file.name) renameFile(state, file.id, data['name']);
          return file;
        },
        signal
      );
      host.notifyFiles(app.id);
      return result;
    },
    'files.rename': async (data, signal) => {
      const result = await write(
        'files',
        text(data, 'id'),
        state => renameFile(state, text(data, 'id'), text(data, 'name')),
        signal
      );
      host.notifyFiles(app.id);
      return result;
    },
    'files.move': async (data, signal) => {
      const parentId = nullableText(data, 'parentId');
      await host.authorize(app, 'files', `directory:${parentId ?? 'root'}`, signal);
      const result = await write(
        'files',
        text(data, 'id'),
        state => {
          requireCondition(
            checkPermission(state, identity, 'files', `directory:${parentId ?? 'root'}`),
            'DENIED',
            '目标目录授权已撤销'
          );
          return moveFile(state, text(data, 'id'), parentId);
        },
        signal
      );
      host.notifyFiles(app.id);
      return result;
    },
    'files.trash': async (data, signal) => {
      await write('files', '*', state => trashFile(state, text(data, 'id')), signal);
      host.notifyFiles(app.id);
      return true;
    },
    'files.restore': async (data, signal) => {
      const id = text(data, 'id');
      const snapshot = await read('files', '*', state => state, signal);
      const file = findFile(snapshot, id);
      let parentId = data['parentId'] === undefined ? file.parentId : nullableText(data, 'parentId');
      let name = data['name'] === undefined ? file.name : text(data, 'name');
      if (
        parentId !== null &&
        !snapshot.files.some(dir => dir.id === parentId && !dir.deleted && dir.kind === 'directory')
      ) {
        const answer = await host.dialogs.ask(
          {
            title: '选择恢复位置',
            message: '原目录已不在普通文件中，请选择恢复目标。',
            fields: [
              {
                name: 'target',
                label: '目录',
                value: 'root',
                options: [
                  { value: 'root', label: '我的文件' },
                  ...snapshot.files
                    .filter(dir => !dir.deleted && dir.kind === 'directory')
                    .map(dir => ({ value: dir.id, label: dir.name }))
                ]
              }
            ],
            actions: [
              { id: 'restore', label: '恢复到此目录' },
              { id: 'cancel', label: '取消' }
            ]
          },
          signal
        );
        requireCondition(answer.action === 'restore', 'CANCELLED', '恢复已取消');
        parentId = answer.values['target'] === 'root' ? null : answer.values['target'];
      }
      if (snapshot.files.some(entry => !entry.deleted && entry.parentId === parentId && entry.name === name)) {
        const answer = await host.dialogs.ask(
          {
            title: '恢复文件重名',
            message: '目标位置已有同名文件，请使用新名称；现有文件不会被覆盖。',
            fields: [{ name: 'name', label: '恢复名称', value: name }],
            actions: [
              { id: 'restore', label: '以此名称恢复' },
              { id: 'cancel', label: '取消' }
            ]
          },
          signal
        );
        requireCondition(answer.action === 'restore', 'CANCELLED', '恢复已取消');
        name = answer.values['name'];
      }
      const result = await write('files', '*', state => restoreFile(state, id, parentId, name), signal);
      host.notifyFiles(app.id);
      return result;
    },
    'files.emptyTrash': async (_data, signal) => {
      const count = await read('files', '*', state => state.files.filter(file => file.deleted).length, signal);
      const answer = await host.dialogs.ask(
        {
          title: `清空回收站 ${count} 项`,
          message: '将永久删除回收站中的全部文件字节和目录元数据，无法恢复。',
          actions: [
            { id: 'delete', label: '永久删除全部回收项', danger: true },
            { id: 'cancel', label: '取消' }
          ]
        },
        signal
      );
      requireCondition(answer.action === 'delete', 'CANCELLED', '清空已取消');
      const result = await write(
        'files',
        '*',
        state => {
          requireCondition(
            state.files.filter(file => file.deleted).length === count,
            'CONFLICT',
            '回收站已有变化，请重新确认'
          );
          return emptyTrash(state);
        },
        signal
      );
      host.notifyFiles(app.id);
      return result;
    },
    'files.delete': async (data, signal) => {
      await write('files', '*', state => deleteFile(state, text(data, 'id')), signal);
      host.notifyFiles(app.id);
      return true;
    },
    'files.import': async (data, signal) => {
      requireCondition(Array.isArray(data['files']) && data['files'].every(isRecord), 'INVALID', '导入清单无效');
      const inputs: ImportInput[] = data['files'].map(fileInput);
      validateImport(inputs);
      const preview = await read('files', '*', state => state, signal);
      for (const input of inputs) {
        const existing = preview.files.find(
          file => !file.deleted && file.parentId === input.parentId && file.name === input.name
        );
        if (existing) {
          const decision = await host.dialogs.ask(
            {
              title: '导入文件重名',
              message: `“${input.name}” 已存在。替换将检查当前版本。`,
              actions: [
                { id: 'skip', label: '跳过' },
                { id: 'keep', label: '保留两份' },
                { id: 'replace', label: '替换', danger: true },
                { id: 'cancel', label: '取消导入' }
              ]
            },
            signal
          );
          requireCondition(
            decision.action === 'skip' || decision.action === 'keep' || decision.action === 'replace',
            'CANCELLED',
            '整批导入已取消，原文件未改变'
          );
          input.resolution = decision.action;
          input.revision = existing.revision;
        }
        importFiles(preview, [input]);
      }
      const result = await write('files', '*', state => importFiles(state, inputs), signal);
      host.notifyFiles(app.id);
      return result;
    },
    'files.open': async (data, signal) => {
      const file = await read('files', text(data, 'id'), state => readFile(state, text(data, 'id')), signal);
      const compatible = builtins.filter(
        definition =>
          definition.fileTypes.includes(file.mime) &&
          host.state.installations.some(installation => installation.appId === definition.id)
      );
      requireCondition(compatible.length, 'UNSUPPORTED', '没有兼容应用，可下载此文件');
      requireCondition(
        data['appId'] === undefined || compatible.some(definition => definition.id === data['appId']),
        'UNSUPPORTED',
        '指定应用未安装或不兼容'
      );
      const preferred = host.state.associations[file.mime];
      let selected = typeof data['appId'] === 'string' ? data['appId'] : preferred;
      if (
        data['choose'] === true ||
        (selected !== undefined && !compatible.some(definition => definition.id === selected)) ||
        (selected === undefined && compatible.length > 1)
      ) {
        const answer = await host.dialogs.ask(
          {
            title: '选择打开方式',
            message: `选择用于打开“${file.name}”的应用。读取文件仍需单独授权。`,
            fields: [
              {
                name: 'app',
                label: '打开应用',
                value: compatible[0].id,
                options: compatible.map(definition => ({ value: definition.id, label: definition.name }))
              },
              {
                name: 'default',
                label: '作为此类型的默认应用',
                value: 'no',
                options: [
                  { value: 'no', label: '仅打开这次' },
                  { value: 'yes', label: '设为默认' }
                ]
              }
            ],
            actions: [
              { id: 'open', label: '用此应用打开' },
              { id: 'cancel', label: '取消' }
            ]
          },
          signal
        );
        requireCondition(answer.action === 'open', 'CANCELLED', '打开已取消');
        selected = answer.values['app'];
        requireCondition(
          compatible.some(definition => definition.id === selected),
          'UNSUPPORTED',
          '应用未安装或不兼容'
        );
        if (answer.values['default'] === 'yes')
          await write(
            'files',
            file.id,
            state => {
              state.associations[file.mime] = String(selected);
            },
            signal
          );
      }
      selected ??= compatible[0].id;
      requireCondition(
        compatible.some(definition => definition.id === selected),
        'UNSUPPORTED',
        '打开方式不兼容或已卸载'
      );
      host.launch(selected, data['newInstance'] === true, file.id);
      await host.persistSession();
      return true;
    },
    'storage.get': (data, signal) =>
      read(
        'storage',
        '*',
        state =>
          state.appData.find(
            item => item.appId === app.definition.id && item.key === text(data, 'key') && item.schemaVersion === 1
          )?.value ?? null,
        signal
      ),
    'storage.set': (data, signal) =>
      write(
        'storage',
        '*',
        state => {
          requireCondition(data['schemaVersion'] === 1 && isJson(data['value']), 'INVALID', '私有数据模式不兼容');
          const key = text(data, 'key');
          state.appData = state.appData.filter(item => !(item.appId === app.definition.id && item.key === key));
          state.appData.push({ appId: app.definition.id, schemaVersion: 1, key, value: data['value'] });
          return true;
        },
        signal
      ),
    'profile.get': (_data, signal) =>
      read(
        'settings',
        '*',
        state => ({
          profile: state.profile,
          workspaces: state.workspaces,
          grants: state.grants,
          offlineReady: host.offlineReady,
          version: '1.0.0'
        }),
        signal
      ),
    'profile.set': async (data, signal) => {
      await host.authorize(app, 'settings', '*', signal);
      requireCondition(isRecord(data['patch']), 'INVALID', '偏好格式无效');
      requireCondition(checkPermission(host.state, identity, 'settings', '*'), 'DENIED', '设置授权已撤销');
      await host.updateProfile(data['patch'] as Partial<Profile>);
      return host.state.profile;
    },
    'permissions.revoke': async (data, signal) => {
      await write('settings', '*', state => revokePermission(state, text(data, 'id')), signal);
      return true;
    },
    'workspaces.create': (data, signal) =>
      write(
        'settings',
        '*',
        state => {
          const name = text(data, 'name').trim();
          requireCondition(
            name.length > 0 && name.length <= 80 && state.workspaces.length < 12,
            'INVALID',
            '工作区名称为 1–80 字符，最多 12 个工作区'
          );
          const workspace = { id: crypto.randomUUID(), name };
          state.workspaces.push(workspace);
          state.navigation.activeWindows[workspace.id] = null;
          return workspace;
        },
        signal
      ),
    'workspaces.rename': async (data, signal) =>
      write(
        'settings',
        '*',
        state => {
          const workspace = state.workspaces.find(item => item.id === text(data, 'id'));
          const name = text(data, 'name').trim();
          requireCondition(workspace && name.length > 0 && name.length <= 80, 'INVALID', '工作区名称无效');
          workspace.name = name;
          return true;
        },
        signal
      ),
    'workspaces.reorder': (data, signal) =>
      write(
        'settings',
        '*',
        state => {
          reorderWorkspaces(state, data['ids']);
          return true;
        },
        signal
      ),
    'workspaces.delete': async (data, signal) => {
      const id = text(data, 'id');
      const target = text(data, 'target');
      await write(
        'settings',
        '*',
        state => {
          requireCondition(
            state.workspaces.length > 1 &&
              id !== target &&
              state.workspaces.some(item => item.id === id) &&
              state.workspaces.some(item => item.id === target),
            'INVALID',
            '至少保留一个工作区，迁移目标须有效'
          );
          state.workspaces = state.workspaces.filter(item => item.id !== id);
          delete state.navigation.activeWindows[id];
          if (state.navigation.workspaceId === id) state.navigation.workspaceId = target;
          for (const saved of state.session) if (saved.workspaceId === id) saved.workspaceId = target;
        },
        signal
      );
      for (const win of host.model.windows) if (win.workspaceId === id) win.workspaceId = target;
      if (host.model.workspaceId === id) host.setWorkspace(target);
      delete host.model.activeWindows[id];
      host.syncVisibility();
      host.changed();
      await host.persistSession();
      return true;
    },
    'apps.list': (_data, signal) =>
      read(
        'apps',
        '*',
        state =>
          builtins.map(base => {
            const installation = state.installations.find(item => item.appId === base.id);
            const latest = latestRelease(base.id);
            const current = installation ? getRelease(base.id, installation.version) : latest;
            return {
              ...current.definition,
              installed: Boolean(installation),
              origin: host.baseURL().origin,
              offlineReady: Boolean(installation) && host.offlineReady,
              availableVersion: latest.definition.version,
              updateAvailable: Boolean(installation && installation.version !== latest.definition.version),
              previousVersion: installation?.previousVersion ?? null,
              changes: latest.changes
            };
          }),
        signal
      ),
    'apps.install': async (data, signal) => {
      const id = text(data, 'id');
      const release = latestRelease(id);
      await host.authorize(app, 'apps', '*', signal);
      requireCondition(!host.changingApplications.has(id), 'BUSY', '此应用正在切换版本');
      const key = import.meta.env.DEV ? null : host.resources.find(id, release.definition.version).key;
      const unhold = key === null ? null : host.resources.hold({ appId: id, version: release.definition.version, key });
      try {
        if (key) await host.resources.prepare({ appId: id, version: release.definition.version, key }, { signal });
        return await write(
          'apps',
          '*',
          state => {
            const current = state.installations.find(item => item.appId === id);
            if (current) return current;
            const installation = installApp(state, id);
            installation.resourceVersion = key;
            return installation;
          },
          signal
        );
      } finally {
        unhold?.();
        host.applicationsChanged(id);
      }
    },
    'apps.update': async (data, signal) => {
      await read('apps', '*', () => true, signal);
      return changeApplication(host, text(data, 'id'), false, signal, state =>
        requireCondition(checkPermission(state, host.identity(app), 'apps', '*'), 'DENIED', '应用管理授权已撤销')
      );
    },
    'apps.rollback': async (data, signal) => {
      await read('apps', '*', () => true, signal);
      return changeApplication(host, text(data, 'id'), true, signal, state =>
        requireCondition(checkPermission(state, host.identity(app), 'apps', '*'), 'DENIED', '应用管理授权已撤销')
      );
    },
    'apps.uninstall': async (data, signal) => {
      const id = text(data, 'id');
      requireCondition(!getDefinition(id).system, 'DENIED', '系统组件不能卸载');
      await host.authorize(app, 'apps', '*', signal);
      requireCondition(!host.changingApplications.has(id), 'BUSY', '此应用正在切换版本');
      host.changingApplications.add(id);
      host.prefetch.cancel(id);
      try {
        const targets = [...host.instances.values()]
          .filter(instance => instance.definition.id === id)
          .map(instance => instance.id);
        requireCondition(await host.closeInstances(targets), 'CANCELLED', '卸载已取消');
        await write('apps', '*', state => uninstallApp(state, id, data['clearData'] === true), signal);
        return true;
      } finally {
        host.changingApplications.delete(id);
        host.applicationsChanged(id);
      }
    },
    'message.send': async (data, signal) => {
      const target = host.instances.get(text(data, 'targetInstanceId'));
      requireCondition(target, 'NOT_FOUND', '目标实例已退出');
      requireCondition(
        text(data, 'channel') === 'documents' && isJson(data['payload']),
        'INVALID',
        '消息通道或载荷无效'
      );
      requireCondition(
        new TextEncoder().encode(JSON.stringify(data['payload'])).length <= 65536,
        'LIMIT',
        '消息不能超过 64 KiB'
      );
      await read('messages', target.definition.id, () => true, signal);
      requireCondition(host.instances.has(target.id), 'NOT_FOUND', '目标实例已退出');
      requireCondition(target.status === 'ready' || target.status === 'hidden', 'NOT_READY', '目标实例尚未就绪');
      target.handle.emit('message.received', {
        source: { appId: app.definition.id, instanceId: app.id },
        channel: 'documents',
        payload: json(data['payload'])
      });
      return true;
    },
    'notification.post': async (data, signal) => {
      await read('notifications', '*', () => true, signal);
      const notification = {
        id: crypto.randomUUID(),
        instanceId: app.id,
        appId: app.definition.id,
        title: text(data, 'title').slice(0, 160),
        body: text(data, 'body').slice(0, 2000),
        time: Date.now()
      };
      host.notifications.push(notification);
      host.changed();
      return notification.id;
    },
    'clipboard.read': async (_data, signal) => {
      await read('clipboard', 'read', () => true, signal);
      return navigator.clipboard.readText();
    },
    'clipboard.write': async (data, signal) => {
      await read('clipboard', 'write', () => true, signal);
      await navigator.clipboard.writeText(text(data, 'text'));
      return true;
    },
    'backup.export': (_data, signal) => read('settings', '*', state => exportBackup(state), signal),
    'backup.validate': async (data, signal) => {
      await read('settings', '*', () => true, signal);
      const state = await validateBackup(data['backup']);
      return { files: state.files.length, workspaces: state.workspaces.length, unencrypted: true };
    },
    'backup.restore': async (data, signal) => {
      await read('settings', '*', () => true, signal);
      const replacement = await validateBackup(data['backup']);
      const result = await host.dialogs.ask(
        {
          title: '替换桌面托管数据？',
          message: `将替换 ${replacement.files.length} 个文件、应用数据、偏好和工作区。权限不会恢复。当前未保存文档须先处理。`,
          actions: [
            { id: 'restore', label: '确认恢复', danger: true },
            { id: 'cancel', label: '取消' }
          ]
        },
        signal
      );
      requireCondition(
        result.action === 'restore' &&
          (await host.closeInstances([...host.instances.keys()].filter(id => id !== app.id))),
        'CANCELLED',
        '恢复已取消'
      );
      await write(
        'settings',
        '*',
        state => {
          Object.assign(state, replacement);
          state.grants = [];
        },
        signal
      );
      host.model.workspaceId = replacement.workspaces[0].id;
      host.changed();
      return true;
    },
    'backup.reset': async (data, signal) => {
      const scope = data['scope'] ?? 'all';
      requireCondition(scope === 'configuration' || scope === 'all', 'INVALID', '重置范围无效');
      const configuration = scope === 'configuration';
      await read('settings', '*', () => true, signal);
      const first = await host.dialogs.ask(
        {
          title: configuration ? '只重置桌面配置' : '重置桌面',
          message:
            configuration ?
              '将恢复主题、字号、动态效果、应用固定、桌面快捷方式和通知偏好。保留当前交互模式、文件、私有数据、权限、工作区和运行实例。可先取消并导出未加密备份。'
            : '将删除全部托管文件、私有应用数据、授权和配置。请先导出未加密备份。',
          actions: [
            { id: 'next', label: '继续重置', danger: true },
            { id: 'cancel', label: '取消' }
          ]
        },
        signal
      );
      requireCondition(first.action === 'next', 'CANCELLED', '重置已取消');
      const second = await host.dialogs.ask(
        {
          title: '最终确认',
          message:
            configuration ? '确认将上述桌面配置恢复默认值？文件和当前文档保持原样。' : (
              '此操作不可恢复。确认删除此浏览器内的桌面数据？'
            ),
          actions: [
            { id: 'reset', label: configuration ? '确认重置配置' : '确认删除全部数据', danger: true },
            { id: 'cancel', label: '取消' }
          ]
        },
        signal
      );
      requireCondition(
        second.action === 'reset' &&
          (configuration || (await host.closeInstances([...host.instances.keys()].filter(id => id !== app.id)))),
        'CANCELLED',
        '重置已取消'
      );
      await write(
        'settings',
        '*',
        state => {
          if (!configuration) {
            Object.assign(state, createState(host.model.mode));
            return;
          }
          const defaults = defaultProfile(state.profile.mode);
          const installed = new Set(state.installations.map(installation => installation.appId));
          state.profile = {
            ...defaults,
            guided: state.profile.guided,
            pinned: defaults.pinned.filter(id => installed.has(id)),
            shortcuts: defaults.shortcuts.filter(id => installed.has(id))
          };
        },
        signal
      );
      if (!configuration) host.model.workspaceId = 'first';
      host.changed();
      return true;
    },
    'diagnostics.export': (_data, signal) =>
      read('settings', '*', () => diagnostics(host.errors, host.state.installations), signal)
  };
  async function invoke(name: string, payload: unknown, signal: AbortSignal): Promise<Json> {
    requireCondition(
      host.instances.get(app.id) === app && host.ownership.owned && !signal.aborted,
      'OWNERSHIP',
      '调用实例已销毁或失去控制权'
    );
    const data = payload === null ? {} : payload;
    requireCondition(isRecord(data), 'INVALID', '请求载荷须为对象');
    requireCondition(
      (data['instanceId'] === undefined || data['instanceId'] === app.id) &&
        (data['appId'] === undefined || name === 'files.open' || data['appId'] === app.definition.id),
      'DENIED',
      '不能伪造调用身份'
    );
    const handler = methods[name];
    requireCondition(handler, 'INVALID', '未知桌面方法');
    const result = await handler(data, signal);
    return result === undefined ? null : json(result);
  }
  const transferMethods: Record<
    string,
    (payload: Record<string, unknown>, signal: AbortSignal) => unknown | Promise<unknown>
  > = {
    'transfer.begin': payload => host.transfers.begin(app.id, payload),
    'transfer.append': payload => {
      host.transfers.append(app.id, payload);
      return true;
    },
    'transfer.commit': async (payload, signal) => {
      const request = await host.transfers.collect(app.id, text(payload, 'id'));
      return host.transfers.wrap(app.id, await invoke(request.method, request.payload, signal), signal);
    },
    'transfer.download': payload => host.transfers.download(app.id, payload),
    'transfer.release': payload => {
      host.transfers.release(app.id, text(payload, 'id'));
      return true;
    }
  };
  for (const name of Object.keys(methods))
    app.handle.onRequest(name, async (payload: OrbitValue, signal) =>
      host.transfers.wrap(app.id, await invoke(name, payload, signal), signal)
    );
  for (const [name, handler] of Object.entries(transferMethods))
    app.handle.onRequest(name, async (payload: OrbitValue, signal) => {
      requireCondition(
        host.instances.get(app.id) === app && host.ownership.owned && !signal.aborted,
        'OWNERSHIP',
        '传输实例已失效'
      );
      requireCondition(isRecord(payload), 'INVALID', '传输载荷须为对象');
      return json(await handler(payload, signal));
    });
}
