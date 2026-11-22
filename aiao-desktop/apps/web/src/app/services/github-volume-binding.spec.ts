import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import { MemoryDiskStore } from '../disk/memory-disk-store';
import { bindVolumeRepository, gitfile } from './github-volume-binding';
import type {GitSnapshot} from './git/git-protocol';

const root = ['Users','dev','Documents','GitHub','sample'];
const id = 'local-sample';
const bytes = (text: string) => new TextEncoder().encode(text);
const snapshot: GitSnapshot = {projectId: id,revision:1,files:[{path:'a',bytes:bytes('original')}]};

describe('卷内仓库的发布与重试', () => {
  const metadata = new Map<string,string>();
  const missing = () => new DOMException('missing','NotFoundError');
  const dir = {
    getDirectoryHandle: async () => dir,
    async getFileHandle(key: string, options?: {create: boolean}) {
      if (!metadata.has(key) && !options?.create) throw missing();
      return {getFile: async () => new Blob([metadata.get(key) ?? '']), createWritable: async () => ({write: async (value: string) => {metadata.set(key,value);}, close: async () => undefined})};
    },
    async removeEntry(key: string) { if (!metadata.delete(key)) throw missing(); }
  };
  const git = { open: vi.fn(async () => snapshot), create: vi.fn(), importArchive: vi.fn() };
  const copy = {source: 'original-archive', create: vi.fn(async () => {metadata.set('state.json','1'); return snapshot;})};
  let store: MemoryDiskStore;
  beforeEach(() => {
    store = new MemoryDiskStore(); metadata.clear(); vi.clearAllMocks();
    vi.stubGlobal('navigator',{storage:{getDirectory:async () => dir}});
  });
  afterEach(() => vi.unstubAllGlobals());
  const register = async (value: GitSnapshot) => value;
  const bind = () => bindVolumeRepository(store,root,id,git,{copy},register);

  it('发布前中断可用同一个来源重试，不覆盖已存在的同名目标', async () => {
    vi.spyOn(store,'move').mockRejectedValueOnce(new Error('interrupted'));
    await expect(bind()).rejects.toThrow('interrupted');
    expect(await store.kindOf(root)).toBeNull();
    await expect(bind()).resolves.toEqual(snapshot);
    expect(copy.create).toHaveBeenCalledTimes(1);
    expect(await store.read([...root,'.git'])).toEqual(bytes(gitfile(id)));
    await store.write([...root,'a'],bytes('user edit'));
    await expect(bind()).rejects.toThrow('目标目录已存在');
    expect(await store.read([...root,'a'])).toEqual(bytes('user edit'));
  });

  it('坏归档后可以在原位置重试，普通目录给出初始化提示', async () => {
    copy.create.mockRejectedValueOnce(new Error('invalid archive'));
    await expect(bind()).rejects.toThrow('invalid archive');
    expect(metadata.has('volume-binding.json')).toBe(false);
    await expect(bind()).resolves.toEqual(snapshot);
    await expect(bindVolumeRepository(store, ['other'], 'other',git,{},register)).rejects.toThrow('git init');
  });

  it('原卷内 .git 只有在导入成功后才换成仓库指针', async () => {
    await store.write([...root,'.git','HEAD'],bytes('ref: refs/heads/topic'));
    await store.write([...root,'a'],bytes('working'));
    git.importArchive.mockRejectedValueOnce(new Error('bad index')).mockResolvedValueOnce(snapshot);
    const open = () => bindVolumeRepository(store,root,id,git,{},register);
    await expect(open()).rejects.toThrow('bad index');
    expect(await store.read([...root,'.git','HEAD'])).toEqual(bytes('ref: refs/heads/topic'));
    await open();
    expect(await store.read([...root,'a'])).toEqual(bytes('working'));
    expect(await store.read([...root,'.git'])).toEqual(bytes(gitfile(id)));
  });
});
