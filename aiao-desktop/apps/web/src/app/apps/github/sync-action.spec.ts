import { describe, expect, it } from 'vitest';
import type { GithubRepositoryRecord } from '../../services/github-repository';
import { syncActionOf } from './sync-action';

const record: GithubRepositoryRecord = {
  projectId: 'repo',
  name: 'octo/repo',
  owner: 'octo',
  repo: 'repo',
  private: false,
  branch: 'main',
  remoteHead: 'remote-1',
  remoteTree: 'tree-1',
  remoteEntries: [],
  localHead: 'local-1',
  updatedAt: 0
};

const main = { branch: 'main', head: 'local-1' };

describe('GitHub 工具栏同步操作', () => {
  it('无 origin 时保留本地刷新，未知远端状态时先 Fetch', () => {
    expect(syncActionOf(null, null)).toBe('refresh');
    expect(syncActionOf({ ...record, owner: null }, main)).toBe('refresh');
    expect(syncActionOf({ ...record, remoteHead: null, remoteTree: null }, main)).toBe('fetch');
    expect(syncActionOf(record, null)).toBe('fetch');
    expect(syncActionOf({ ...record, localHead: undefined }, main)).toBe('fetch');
  });

  it('已同步时 Fetch，有本地待推送提交时 Push，分叉时优先 Pull', () => {
    const ahead = { ...main, head: 'local-2' };
    const behind = { ...record, fetched: { branch: 'main', head: 'remote-2' } };
    expect(syncActionOf(record, main)).toBe('fetch');
    expect(syncActionOf(record, ahead)).toBe('push');
    expect(syncActionOf(behind, main)).toBe('pull');
    expect(syncActionOf(behind, ahead)).toBe('pull');
    expect(syncActionOf({ ...record, localHead: null }, main)).toBe('push');
  });

  it('按当前分支判断基线和远端观察值，不串用其他分支的状态', () => {
    const topic = { branch: 'topic', head: 'local-topic' };
    const branchBases = [{ branch: 'topic', head: 'remote-topic', tree: 'tree-topic', localHead: 'local-topic' }];
    const fetched = [{ branch: 'main', head: 'remote-2' }];
    expect(syncActionOf({ ...record, fetched }, topic)).toBe('publish');
    expect(syncActionOf({ ...record, branchBases, fetched }, topic)).toBe('fetch');
    expect(syncActionOf({ ...record, branchBases, fetched }, { ...topic, head: 'changed' })).toBe('push');
    expect(syncActionOf({ ...record, fetched: [{ branch: 'topic', head: 'remote-topic' }] }, topic)).toBe('pull');
  });

  it('只对有提交的分支提供 Publish，允许空仓库拉取已发现的远端分支', () => {
    const missing = { ...record, fetched: [{ branch: 'main', head: null }] };
    const empty = { ...main, head: null };
    expect(syncActionOf(missing, main)).toBe('publish');
    expect(syncActionOf(missing, empty)).toBe('fetch');
    expect(syncActionOf(record, { ...main, branch: 'detached' })).toBe('detached');
    const behind = { ...record, fetched: { branch: 'main', head: 'remote-2' } };
    expect(syncActionOf(behind, empty)).toBe('pull');
  });
});
