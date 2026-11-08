export interface BackupWorkspace {
  id: string;
  label: string;
  createdAt: string | null;
}

interface BackupSelection {
  profileId: string;
  identity: string | null;
  message: string;
}

type BackupStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const historyKey = 'aiao-local-backup-workspaces-v1';
const previousKey = 'aiao-local-previous-profile-v1';
const selectionKey = 'aiao-local-backup-selection-v1';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** 读取本机恢复入口，并兼容旧版本保留的上一个工作区。 */
export function readBackupWorkspaces(storage: BackupStorage): BackupWorkspace[] {
  const saved = storage.getItem(historyKey);
  let value: { version: number; workspaces: BackupWorkspace[] };
  try {
    value = saved ? JSON.parse(saved) : { version: 1, workspaces: [] };
  } catch {
    throw new Error('本机恢复记录不可读，未更改现有工作区。');
  }
  if (
    !value ||
    value.version !== 1 ||
    !Array.isArray(value.workspaces) ||
    value.workspaces.some(
      workspace =>
        !workspace ||
        !uuid.test(workspace.id) ||
        typeof workspace.label !== 'string' ||
        !workspace.label ||
        workspace.label.length > 200 ||
        (workspace.createdAt !== null &&
          (typeof workspace.createdAt !== 'string' || !Number.isFinite(Date.parse(workspace.createdAt))))
    ) ||
    new Set(value.workspaces.map(workspace => workspace.id)).size !== value.workspaces.length
  )
    throw new Error('本机恢复记录不可读，未更改现有工作区。');
  const previous = storage.getItem(previousKey);
  if (previous && !uuid.test(previous)) throw new Error('旧工作区恢复记录无效，未更改现有工作区。');
  if (previous && !value.workspaces.some(workspace => workspace.id === previous))
    value.workspaces.push({ id: previous, label: '导入前工作区', createdAt: null });
  return value.workspaces;
}

/** 保留全部导入和返回入口，兼容标识仍指向刚离开的工作区。 */
export function rememberBackupWorkspace(
  storage: BackupStorage,
  previousId: string,
  nextId: string,
  label: string,
  createdAt: string
): void {
  if (
    !uuid.test(previousId) ||
    !uuid.test(nextId) ||
    previousId === nextId ||
    !label ||
    label.length > 200 ||
    !Number.isFinite(Date.parse(createdAt))
  )
    throw new Error('工作区恢复记录无效。');
  const existing = readBackupWorkspaces(storage);
  const previous = existing.find(workspace => workspace.id === previousId) ?? {
    id: previousId,
    label: '导入前工作区',
    createdAt: null
  };
  const workspaces = [
    { id: nextId, label, createdAt },
    previous,
    ...existing.filter(workspace => workspace.id !== previousId && workspace.id !== nextId)
  ];
  storage.setItem(historyKey, JSON.stringify({ version: 1, workspaces }));
  storage.setItem(previousKey, previousId);
}

/** 将本次显式选择和成功提示保留到当前标签页刷新后。 */
export function rememberBackupSelection(
  storage: BackupStorage,
  profileId: string,
  identity: string | null,
  message: string
): void {
  storage.setItem(selectionKey, JSON.stringify({ profileId, identity, message }));
}

/** 选择标记只包含本机入口和公开身份，不保存会话凭据。 */
export function readBackupSelection(storage: BackupStorage): BackupSelection | null {
  const saved = storage.getItem(selectionKey);
  if (!saved) return null;
  try {
    const value: BackupSelection = JSON.parse(saved);
    if (
      value &&
      uuid.test(value.profileId) &&
      typeof value.message === 'string' &&
      (value.identity === null || typeof value.identity === 'string')
    )
      return value;
  } catch {
    storage.removeItem(selectionKey);
  }
  return null;
}

/** 仅允许相同副本和身份跳过一次账号自动选副本，过期标记同时移除。 */
export function consumeBackupSelection(storage: BackupStorage, profileId: string, identity: string): boolean {
  const selection = readBackupSelection(storage);
  storage.removeItem(selectionKey);
  return selection?.profileId === profileId && selection.identity === identity;
}
