import { describe, expect, it } from 'vitest';

import { ApprovedRelease, catalogManifest } from '../data/approved-catalog';
import { DesktopAppManifests } from '../services/desktop-apps';
import { ApplicationJournal, prepareApplicationChange, recoverApplicationChange } from './application-journal';
import { reconcileApplications } from './application-projection';
import { MemoryDiskStore } from './memory-disk-store';

const release: ApprovedRelease = {
  id: 'catalog:editor',
  name: 'Approved Editor',
  bundleId: 'io.example.editor',
  version: '1.0.0',
  url: 'https://apps.example/releases/1.0.0/editor/',
  summary: 'Edit text.',
  capabilities: ['window'],
  allow: [],
  readyTimeout: 10000
};
const manifests = (entries: ApprovedRelease[] = []): DesktopAppManifests =>
  Object.fromEntries(entries.map(entry => [entry.id, catalogManifest(entry)])) as DesktopAppManifests;
const bundle = ['Applications', 'Approved Editor.app'];
const info = [...bundle, 'Contents', 'Info.plist'];
const encode = (text: string) => new TextEncoder().encode(text);
const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

function journal() {
  let value: unknown = null;
  const api: ApplicationJournal = {
    read: async () => value,
    write: async next => {
      value = next;
    },
    clear: async () => {
      value = null;
    }
  };
  return {
    api,
    set: (next: unknown) => {
      value = next;
    }
  };
}

describe('应用投影中断恢复', () => {
  it('没有日志时不写入；尚未提交的安装清掉未完成包，不改用户文件', async () => {
    const store = new MemoryDiskStore();
    const log = journal();
    expect(await recoverApplicationChange(store, log.api, manifests())).toBe(false);
    await store.write(['Users', 'me', 'keep.txt'], encode('keep'));
    await prepareApplicationChange(store, log.api, manifests(), manifests([release]));
    await store.mkdir([...bundle, 'Contents']);
    await recoverApplicationChange(store, log.api, manifests());
    expect(await store.kindOf(bundle)).toBeNull();
    expect(decode(await store.read(['Users', 'me', 'keep.txt']))).toBe('keep');
    expect(await log.api.read()).toBeNull();
  });

  it('状态已提交的安装补完整包；更新和卸载中断按持久化版本恢复，不依赖残存 plist', async () => {
    const store = new MemoryDiskStore();
    const log = journal();
    await prepareApplicationChange(store, log.api, manifests(), manifests([release]));
    await recoverApplicationChange(store, log.api, manifests([release]));
    expect(decode(await store.read(info))).toContain('1.0.0');
    const next = { ...release, version: '2.0.0', url: 'https://apps.example/releases/2.0.0/editor/' };
    await prepareApplicationChange(store, log.api, manifests([release]), manifests([next]));
    await reconcileApplications(store, manifests([next]));
    await recoverApplicationChange(store, log.api, manifests([release]));
    expect(decode(await store.read(info))).toContain('1.0.0');
    await prepareApplicationChange(store, log.api, manifests([release]), manifests());
    await store.remove(info);
    await recoverApplicationChange(store, log.api, manifests([release]));
    expect(decode(await store.read(info))).toContain('1.0.0');
  });

  it('卸载已提交时只退役系统元数据；保留包内用户文件', async () => {
    const store = new MemoryDiskStore();
    const log = journal();
    await reconcileApplications(store, manifests([release]));
    await store.write([...bundle, 'my-notes.txt'], encode('keep'));
    await prepareApplicationChange(store, log.api, manifests([release]), manifests());
    await recoverApplicationChange(store, log.api, manifests());
    expect(await store.kindOf(info)).toBeNull();
    expect(decode(await store.read([...bundle, 'my-notes.txt']))).toBe('keep');
  });

  it('同名用户条目拒绝安装，不覆盖内容也不记录可清除目标', async () => {
    const store = new MemoryDiskStore();
    const log = journal();
    await store.write([...bundle, 'Contents', 'Info.plist'], encode('custom'));
    await expect(prepareApplicationChange(store, log.api, manifests(), manifests([release]))).rejects.toThrow(
      'already exists'
    );
    expect(await log.api.read()).toBeNull();
    expect(decode(await store.read(info))).toBe('custom');
  });

  it('名称变更中断不留下两个应用包；当前版本以持久化清单为准', async () => {
    const store = new MemoryDiskStore();
    const log = journal();
    await reconcileApplications(store, manifests([release]));
    const renamed = { ...release, name: 'New Editor', version: '2.0.0' };
    await prepareApplicationChange(store, log.api, manifests([release]), manifests([renamed]));
    await reconcileApplications(store, manifests([renamed]));
    await recoverApplicationChange(store, log.api, manifests([release]));
    expect(await store.kindOf(['Applications', 'New Editor.app'])).toBeNull();
    expect(decode(await store.read(info))).toContain('1.0.0');
  });

  it('坏日志与重叠目标拒绝自动清理，保留原记录供修复', async () => {
    const store = new MemoryDiskStore();
    const log = journal();
    for (const value of [
      null,
      {},
      { version: 1, bundles: [{ dir: '../Users', appId: release.id }] },
      { version: 1, bundles: [{ dir: 'Notes.app', appId: 'notes' }] }
    ].slice(1)) {
      log.set(value);
      await expect(recoverApplicationChange(store, log.api, manifests())).rejects.toThrow('record');
      expect(await log.api.read()).toBe(value);
    }
  });
});
