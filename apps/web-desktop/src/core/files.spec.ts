import { describe, expect, it } from 'vitest';
import {
  createFile,
  deleteFile,
  emptyTrash,
  importFiles,
  listFiles,
  moveFile,
  readFile,
  renameFile,
  restoreFile,
  trashFile,
  writeFile
} from './files.js';
import { createState } from './state.js';

describe('DESKTOP-US-601/602/603/604 文件事务模型', () => {
  it('真实空目录，无预置假文件；稳定 ID 重命名不改变字节', () => {
    const state = createState('windows');
    expect(listFiles(state)).toEqual([]);
    const file = createFile(state, { name: '中文.md', bytes: '5Lit5paH', mime: 'text/markdown' });
    renameFile(state, file.id, '笔记.md');
    expect(readFile(state, file.id)).toMatchObject({ id: file.id, name: '笔记.md', bytes: '5Lit5paH', revision: 2 });
  });
  it('同一旧版本保存冲突，保留首个写入内容', () => {
    const state = createState('macos');
    const file = createFile(state, { name: '笔记.txt' });
    writeFile(state, file.id, 1, 'QQ==');
    expect(() => writeFile(state, file.id, 1, 'Qg==')).toThrow('CONFLICT');
    expect(readFile(state, file.id).bytes).toBe('QQ==');
  });
  it.each(['', '.', '..', '../secret', 'a/b', 'a\\b', 'a\u0000b'])('拒绝非法文件名 %s', name => {
    const state = createState('windows');
    expect(() => createFile(state, { name })).toThrow('INVALID');
    expect(state.files).toEqual([]);
  });
  it('同名不能覆盖，目录不能移入自身子目录', () => {
    const state = createState('windows');
    const root = createFile(state, { name: '目录', kind: 'directory' });
    const child = createFile(state, { name: '子目录', kind: 'directory', parentId: root.id });
    expect(() => createFile(state, { name: '目录' })).toThrow('EXISTS');
    expect(() => moveFile(state, root.id, child.id)).toThrow('INVALID');
    expect(root.parentId).toBeNull();
  });
  it('当前目录搜索不泄漏子目录内容，拒绝不存在/非目录父级', () => {
    const state = createState('windows');
    const dir = createFile(state, { name: '目录', kind: 'directory' });
    const file = createFile(state, { name: '内部.txt', parentId: dir.id });
    expect(listFiles(state, null, '内部')).toEqual([]);
    expect(listFiles(state, dir.id, '内部')).toHaveLength(1);
    expect(() => createFile(state, { name: 'bad', parentId: file.id })).toThrow('INVALID');
    expect(() => readFile(state, 'missing')).toThrow('NOT_FOUND');
  });
  it('回收站保持字节、禁止编辑，重名恢复不得覆盖', () => {
    const state = createState('windows');
    const file = createFile(state, { name: 'a.txt', bytes: 'AP8=' });
    trashFile(state, file.id);
    expect(listFiles(state)).toEqual([]);
    expect(() => writeFile(state, file.id, file.revision, '')).toThrow('TRASHED');
    expect(file.bytes).toBe('AP8=');
    createFile(state, { name: 'a.txt' });
    expect(() => restoreFile(state, file.id)).toThrow('EXISTS');
    restoreFile(state, file.id, null, '恢复.txt');
    expect(readFile(state, file.id).bytes).toBe('AP8=');
  });
  it('目录递归回收恢复，永久删除必须先在回收站', () => {
    const state = createState('macos');
    const dir = createFile(state, { name: '目录', kind: 'directory' });
    const child = createFile(state, { name: 'child.txt', parentId: dir.id });
    expect(() => deleteFile(state, dir.id)).toThrow('INVALID');
    trashFile(state, dir.id);
    expect(() => readFile(state, child.id)).toThrow('TRASHED');
    restoreFile(state, dir.id);
    expect(readFile(state, child.id).name).toBe('child.txt');
    trashFile(state, dir.id);
    deleteFile(state, dir.id);
    expect(state.files).toEqual([]);
  });
  it('导入批次先完整验证，后项冲突不能留下前项', () => {
    const state = createState('windows');
    createFile(state, { name: 'exists.bin' });
    const before = structuredClone(state.files);
    expect(() => importFiles(state, [{ name: 'new.bin', bytes: 'AP8=' }, { name: 'exists.bin' }])).toThrow('EXISTS');
    expect(state.files).toEqual(before);
    expect(() => importFiles(state, [{ name: 'big.bin', bytes: 'AAAA' }], 1)).toThrow('LIMIT');
    expect(state.files).toEqual(before);
  });
  it('100 个文件批次上限，显式选择跳过、保留两份和版本检查替换', () => {
    const state = createState('windows');
    const old = createFile(state, { name: '报告.txt', bytes: 'QQ==' });
    expect(() =>
      importFiles(
        state,
        Array.from({ length: 101 }, (_, i) => ({ name: `${i}.txt` }))
      )
    ).toThrow('LIMIT');
    expect(importFiles(state, [{ name: old.name, bytes: 'Qg==', resolution: 'skip' }])).toEqual([]);
    const [copy] = importFiles(state, [{ name: old.name, bytes: 'Qg==', resolution: 'keep' }]);
    expect(copy.name).toBe('报告 (2).txt');
    expect(() => importFiles(state, [{ name: old.name, bytes: 'Qw==', resolution: 'replace', revision: 0 }])).toThrow(
      'CONFLICT'
    );
    const [replaced] = importFiles(state, [
      { name: old.name, bytes: 'Qw==', resolution: 'replace', revision: old.revision }
    ]);
    expect(replaced).toMatchObject({ id: old.id, bytes: 'Qw==', revision: 2 });
    expect(state.files).toHaveLength(2);
  });
  it('目录恢复不能复活之前单独删除的子文件', () => {
    const state = createState('windows');
    const dir = createFile(state, { name: '目录', kind: 'directory' });
    const old = createFile(state, { name: 'old.txt', parentId: dir.id });
    trashFile(state, old.id);
    createFile(state, { name: 'old.txt', parentId: dir.id });
    trashFile(state, dir.id);
    restoreFile(state, dir.id);
    expect(state.files.find(file => file.id === old.id)?.deleted).toBe(true);
    expect(listFiles(state, dir.id)).toHaveLength(1);
  });

  it('清空回收站只删除已回收字节和元数据', () => {
    const state = createState('windows');
    const one = createFile(state, { name: 'one' });
    createFile(state, { name: 'two' });
    trashFile(state, one.id);
    expect(emptyTrash(state)).toBe(1);
    expect(state.files.map(file => file.name)).toEqual(['two']);
    expect(emptyTrash(state)).toBe(0);
  });
});
