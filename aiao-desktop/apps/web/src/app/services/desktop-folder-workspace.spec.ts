import { decodeBase64, encodeBase64, type DesktopWorkspaceRequest } from '@aiao/orbit/desktop';
import { TestBed } from '@angular/core/testing';
import { assert, expect, it, vi } from 'vitest';
import { DESKTOP } from '../disk/disk-path';
import { MemoryDiskStore } from '../disk/memory-disk-store';
import { configureServices } from '../testing/angular';
import { DesktopFolderWorkspace, folderProjectId } from './desktop-folder-workspace';
import { FileSystem } from './file-system';

const root = [...DESKTOP, 'plain'];
const bytes = (text: string) => new TextEncoder().encode(text);
type WithoutProject<T> = T extends DesktopWorkspaceRequest ? Omit<T, 'projectId'> : never;

async function setup() {
  const disk = new MemoryDiskStore();
  await disk.write([...root, 'note.txt'], bytes('original'));
  const notifyChanges = vi.fn();
  configureServices([
    DesktopFolderWorkspace,
    { provide: FileSystem, useValue: { run: (task: (store: MemoryDiskStore) => unknown) => task(disk), notifyChanges } }
  ]);
  const service = TestBed.inject(DesktopFolderWorkspace);
  const projectId = await folderProjectId(root);
  const call = (request: WithoutProject<DesktopWorkspaceRequest>) => service.call(root, { ...request, projectId });
  const open = async () => {
    const snapshot = await call({ operation: 'open' });
    assert(snapshot);
    return snapshot;
  };
  return { disk, notifyChanges, call, open, projectId, service };
}

it('就地读写文本及二进制文件，允许新增与删除，但不会产生 Git 元数据', async () => {
  const { disk, call, open, notifyChanges } = await setup();
  await disk.write([...root, '.git', 'config'], bytes('secret'));
  const opened = await open();
  expect(opened.files.map(file => file.path)).toEqual(['note.txt']);
  const saved = await call({
    operation: 'save',
    expectedRevision: opened.revision,
    files: [{ path: 'sub/pic.bin', base64: encodeBase64(Uint8Array.of(0, 255)) }],
    removedPaths: ['note.txt']
  });
  assert(saved);
  expect(saved.revision).not.toBe(opened.revision);
  expect(decodeBase64(saved.files[0].bytes)).toEqual(Uint8Array.of(0, 255));
  expect(await disk.read([...root, 'sub', 'pic.bin'])).toEqual(Uint8Array.of(0, 255));
  expect(await disk.kindOf([...root, 'note.txt'])).toBeNull();
  expect(await disk.read([...root, '.git', 'config'])).toEqual(bytes('secret'));
  expect(notifyChanges).toHaveBeenCalledExactlyOnceWith([
    [...root, 'note.txt'],
    [...root, 'sub', 'pic.bin']
  ]);
});

it('拒绝过期保存和越界路径，不覆盖终端写入，也不在被移走的路径重建目录', async () => {
  const { disk, call, open } = await setup();
  const { revision } = await open();
  const file = { path: 'note.txt', base64: encodeBase64(bytes('editor')) };
  await disk.write([...root, 'note.txt'], bytes('terminal'));
  await expect(call({ operation: 'save', expectedRevision: revision, files: [file] })).rejects.toThrow(/revision/i);
  const latest = await open();
  for (const path of ['../escape.txt', '.git/config', 'sub/.GIT/config']) {
    await expect(
      call({ operation: 'save', expectedRevision: latest.revision, files: [{ ...file, path }] })
    ).rejects.toThrow(/file path|Git metadata/);
  }
  expect(await disk.read([...root, 'note.txt'])).toEqual(bytes('terminal'));
  await disk.remove(root);
  await expect(call({ operation: 'save', expectedRevision: revision, files: [file] })).rejects.toThrow('目录');
  expect(await disk.kindOf(root)).toBeNull();
});

it('保存时检查完整的文件集合，不把目录覆盖成文件，也不写入大小写冲突的名字', async () => {
  const { disk, call, open } = await setup();
  await disk.mkdir([...root, 'empty']);
  const { revision: expectedRevision } = await open();
  const save = (path: string) =>
    call({ operation: 'save', expectedRevision, files: [{ path, base64: encodeBase64(bytes('new')) }] });
  await expect(save('empty')).rejects.toThrow('EISDIR');
  await expect(save('NOTE.txt')).rejects.toThrow('Case collision');
  expect(await disk.kindOf([...root, 'empty'])).toBe('directory');
  expect(await disk.read([...root, 'note.txt'])).toEqual(bytes('original'));
});

it('文件和目录操作不覆盖目标、不泄露 .git，也不把普通目录当作另一个仓库', async () => {
  const { disk, call, projectId, service } = await setup();
  await disk.write([...root, 'keep.txt'], bytes('keep'));
  await expect(call({ operation: 'rename', path: 'note.txt', destination: 'keep.txt' })).rejects.toThrow();
  await disk.write([...root, 'sub', 'a.txt'], bytes('a'));
  await disk.write([...root, 'sub', '.git', 'config'], bytes('secret'));
  await expect(call({ operation: 'move', path: 'sub', destination: 'renamed' })).rejects.toThrow('.git');
  await call({ operation: 'rename', path: 'note.txt', destination: 'renamed.txt' });
  await call({ operation: 'remove', path: 'renamed.txt' });
  expect(await disk.kindOf([...root, 'renamed.txt'])).toBeNull();
  await expect(call({ operation: 'commit', message: 'not a git repo' })).rejects.toThrow('git');
  await expect(service.call([...DESKTOP, 'other'], { operation: 'open', projectId })).rejects.toThrow();
});
