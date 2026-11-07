import { errorMessage, requireCondition } from '../core/errors.js';
import { removeSavedWindow } from '../core/layout.js';
import type { SavedWindow } from '../core/types.js';
import type { DesktopHost } from './runtime.js';

export interface RecoveryFailure {
  error: string;
  busy: boolean;
}

function attemptRestore(host: DesktopHost, saved: SavedWindow, failure: RecoveryFailure): string | null {
  try {
    const app = host.launch(saved.appId, true, saved.fileId, saved);
    const win = host.model.windows.find(item => item.instanceId === app.id);
    requireCondition(win, 'NOT_FOUND', '恢复的窗口不存在');
    return win.id;
  } catch (error) {
    failure.error = errorMessage(error);
    return null;
  }
}

export function restoreSavedSession(host: DesktopHost): void {
  host.recovery.clear();
  const saved = [...host.state.session];
  const navigation = structuredClone(host.state.navigation);
  const restored: (string | null)[] = [];
  host.sessionRestored = saved.length > 0;
  for (const win of saved) {
    const failure = { error: '', busy: false };
    const id = attemptRestore(host, win, failure);
    restored.push(id);
    if (id === null) host.recovery.set(win.id, failure);
  }
  host.recoveryOpen = host.recovery.size > 0;
  host.model.workspaceId = navigation.workspaceId;
  host.model.activeWindows = Object.fromEntries(
    Object.entries(navigation.activeWindows).map(([workspace, index]) => [
      workspace,
      index === null ? null : restored[index]
    ])
  );
  host.model.activeId = host.model.activeWindows[host.model.workspaceId];
  host.syncVisibility();
}

export function reconcileRecovery(host: DesktopHost): void {
  const ids = new Set(host.state.session.map(win => win.id));
  for (const id of host.recovery.keys()) if (!ids.has(id)) host.recovery.delete(id);
  if (host.recovery.size === 0) host.recoveryOpen = false;
}

function recoveryEntry(host: DesktopHost, id: string) {
  requireCondition(host.phase === 'ready' && host.ownership.owned, 'OWNERSHIP', '桌面当前不可写');
  const failure = host.recovery.get(id);
  const saved = host.state.session.find(win => win.id === id);
  requireCondition(failure && saved, 'NOT_FOUND', '待恢复窗口已移除');
  requireCondition(!failure.busy, 'BUSY', '此恢复项正在处理中');
  return { failure, saved };
}

export async function retryRecoveryEntry(host: DesktopHost, id: string): Promise<boolean> {
  const { failure, saved } = recoveryEntry(host, id);
  failure.busy = true;
  host.changed();
  try {
    if (attemptRestore(host, saved, failure) === null) return false;
    host.recovery.delete(id);
    await host.persistSession();
    return true;
  } finally {
    failure.busy = false;
    host.changed();
  }
}

export async function removeRecoveryEntry(host: DesktopHost, id: string): Promise<boolean> {
  const { failure } = recoveryEntry(host, id);
  failure.busy = true;
  host.changed();
  try {
    await host.mutate(state => removeSavedWindow(state, id));
    return true;
  } catch (error) {
    failure.error = errorMessage(error);
    return false;
  } finally {
    failure.busy = false;
    host.changed();
  }
}
