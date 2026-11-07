import { describe, expect, it } from 'vitest';
import { createWorkbenchRecoveryJournal } from './workbench-recovery.js';

function fixture() {
  const entries = new Map<string, string>();
  const storage = {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => entries.set(key, value),
    removeItem: (key: string) => entries.delete(key)
  };
  return { entries, storage, journal: createWorkbenchRecoveryJournal(storage) };
}

const state = { tabs: ['main.ts'], activePath: 'main.ts', drafts: { 'main.ts': { base: 'saved', content: 'draft' } } };

describe('刷新前的同步恢复日志', () => {
  it('数据库落盘前可跨实例恢复，落盘确认后清理', () => {
    const { journal, storage } = fixture();
    const acknowledge = journal.stageProject('one', state);
    const reopened = createWorkbenchRecoveryJournal(storage);
    expect(reopened.getProject('one')).toEqual(state);
    expect(reopened.getProject('two')).toBeNull();
    acknowledge();
    expect(reopened.getProject('one')).toBeNull();
  });

  it('旧写入确认不清理更新的日志，内容相同的重复写入也保持代次隔离', () => {
    const { journal } = fixture();
    const older = journal.stageProject('one', state);
    const newer = journal.stageProject('one', state);
    older();
    expect(journal.getProject('one')).toEqual(state);
    newer();
    expect(journal.getProject('one')).toBeNull();
  });

  it('偏好独立恢复，损坏日志显式报错且保留原文', () => {
    const { journal, entries } = fixture();
    const preferences = { indentUnit: '    ', alwaysShowScmActions: true, runtime: 'webcontainer' as const };
    const acknowledge = journal.stagePreferences(preferences);
    expect(journal.getPreferences()).toEqual(preferences);
    acknowledge();
    expect(journal.getPreferences()).toBeNull();
    journal.stageProject('one', state);
    const key = [...entries.keys()][0];
    entries.set(key, '{broken');
    expect(() => journal.getProject('one')).toThrow();
    expect(entries.get(key)).toBe('{broken');
  });

  it.each([
    null,
    [],
    {},
    { generation: 1, value: state },
    { generation: 'one' },
    { generation: 'one', value: { tabs: 1 } }
  ])('拒绝非法恢复日志结构 %j，原始日志不被清理', value => {
    const { journal, entries } = fixture();
    journal.stageProject('one', state);
    const key = [...entries.keys()][0];
    const text = JSON.stringify(value);
    entries.set(key, text);
    expect(() => journal.getProject('one')).toThrow();
    expect(entries.get(key)).toBe(text);
  });

  it('恢复日志空间不足时抛错，由宿主报告持久化失败', () => {
    const { storage } = fixture();
    const journal = createWorkbenchRecoveryJournal({
      ...storage,
      setItem: () => {
        throw new DOMException('quota', 'QuotaExceededError');
      }
    });
    expect(() => journal.stageProject('one', state)).toThrow('quota');
  });
});
