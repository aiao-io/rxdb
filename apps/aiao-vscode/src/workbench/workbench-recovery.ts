import {
  parseWorkbenchPreferences,
  parseWorkbenchProjectState,
  type WorkbenchPreferences,
  type WorkbenchProjectState
} from './workbench-state.js';

type RecoveryStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** 先同步记录，再异步落库；每次写入独立确认，避免旧请求清掉新草稿。 */
export function createWorkbenchRecoveryJournal(storage: RecoveryStorage) {
  const projectKey = (id: string) => `aiao-workbench:recovery:project:${encodeURIComponent(id)}`;
  const preferencesKey = 'aiao-workbench:recovery:preferences';

  function read<T>(key: string, parse: (value: unknown) => T): T | null {
    const text = storage.getItem(key);
    if (text === null) return null;
    let envelope: unknown;
    try {
      envelope = JSON.parse(text);
    } catch (cause: unknown) {
      throw new Error('工作台恢复日志损坏', { cause });
    }
    if (
      envelope === null ||
      typeof envelope !== 'object' ||
      !('generation' in envelope) ||
      typeof envelope.generation !== 'string' ||
      !('value' in envelope)
    )
      throw new Error('工作台恢复日志损坏');
    return parse(envelope.value);
  }

  function stage(key: string, value: WorkbenchProjectState | WorkbenchPreferences): () => void {
    const entry = JSON.stringify({ generation: crypto.randomUUID(), value });
    storage.setItem(key, entry);
    return () => {
      if (storage.getItem(key) === entry) storage.removeItem(key);
    };
  }

  return {
    getProject: (id: string) => read(projectKey(id), parseWorkbenchProjectState),
    stageProject: (id: string, state: WorkbenchProjectState) => stage(projectKey(id), state),
    getPreferences: () => read(preferencesKey, parseWorkbenchPreferences),
    stagePreferences: (preferences: WorkbenchPreferences) => stage(preferencesKey, preferences)
  };
}
