import { beforeEach, describe, expect, it } from 'vitest';
import {
  consumeBackupSelection,
  readBackupSelection,
  readBackupWorkspaces,
  rememberBackupSelection,
  rememberBackupWorkspace
} from './backup-workspaces';

const original = '10000000-0000-4000-8000-000000000001';
const first = '10000000-0000-4000-8000-000000000002';
const second = '10000000-0000-4000-8000-000000000003';
const at = '2026-11-05T04:00:00.000Z';

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe('backup workspace history', () => {
  it('exposes the previous workspace retained by an older version', () => {
    localStorage.setItem('aiao-local-previous-profile-v1', original);
    expect(readBackupWorkspaces(localStorage)).toEqual([{ id: original, label: '导入前工作区', createdAt: null }]);
  });

  it('retains every workspace across consecutive imports and return visits', () => {
    rememberBackupWorkspace(localStorage, original, first, '第一份备份.json', at);
    rememberBackupWorkspace(localStorage, first, second, '第二份备份.json', at);
    rememberBackupWorkspace(localStorage, second, original, '导入前工作区', at);
    expect(readBackupWorkspaces(localStorage).map(workspace => workspace.id)).toEqual([original, second, first]);
    expect(readBackupWorkspaces(localStorage).find(workspace => workspace.id === first)?.label).toBe('第一份备份.json');
    expect(localStorage.getItem('aiao-local-previous-profile-v1')).toBe(second);
  });

  it('refuses damaged history without replacing it', () => {
    localStorage.setItem('aiao-local-backup-workspaces-v1', '{');
    expect(() => rememberBackupWorkspace(localStorage, original, first, '备份.json', at)).toThrow('恢复记录');
    expect(localStorage.getItem('aiao-local-backup-workspaces-v1')).toBe('{');
  });
});

describe('explicit backup workspace selection', () => {
  it('keeps the success message across reload and consumes an identity-matched selection once', () => {
    rememberBackupSelection(sessionStorage, original, 'signed-in:project:user', '已切回原工作区。');
    expect(readBackupSelection(sessionStorage)?.message).toBe('已切回原工作区。');
    expect(consumeBackupSelection(sessionStorage, original, 'signed-in:project:user')).toBe(true);
    expect(consumeBackupSelection(sessionStorage, original, 'signed-in:project:user')).toBe(false);
  });

  it.each([
    [first, 'signed-in:project:user'],
    [original, 'signed-in:project:other-user']
  ])('does not preserve a stale choice for profile %s and identity %s', (profileId, identity) => {
    rememberBackupSelection(sessionStorage, original, 'signed-in:project:user', '已切回原工作区。');
    expect(consumeBackupSelection(sessionStorage, profileId, identity)).toBe(false);
    expect(readBackupSelection(sessionStorage)).toBeNull();
  });
});
