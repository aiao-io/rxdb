import { describe, expect, it } from 'vitest';
import { createFile } from '../core/files.js';
import { createState } from '../core/state.js';
import { directoryTrail, filesRoute, parseFilesRoute } from './files-navigation.js';

describe('DESKTOP-US-601/AC4 文件祖先路径', () => {
  it('根目录路径为空，嵌套目录只按父引用显示祖先而非同名邻居', () => {
    const state = createState('windows');
    const first = createFile(state, { name: '项目', kind: 'directory' });
    const neighbor = createFile(state, { name: '邻居', kind: 'directory' });
    const second = createFile(state, { name: '草稿', parentId: first.id, kind: 'directory' });
    createFile(state, { name: '草稿', parentId: neighbor.id, kind: 'directory' });
    expect(directoryTrail(state.files, null)).toEqual([]);
    expect(directoryTrail(state.files, second.id)?.map(item => item.id)).toEqual([first.id, second.id]);
    expect(directoryTrail(state.files, 'missing')).toBeNull();
  });
  it('祖先已从列表移除时明确失效，不能把不完整路径当成根目录', () => {
    const state = createState('windows');
    const first = createFile(state, { name: '项目', kind: 'directory' });
    const second = createFile(state, { name: '草稿', parentId: first.id, kind: 'directory' });
    expect(directoryTrail([second], second.id)).toBeNull();
  });
});

describe('DESKTOP-US-305/501 文件位置往返', () => {
  it('目录、搜索 query 与选择 hash 可持久恢复，回收站与根目录独立', () => {
    const location = { parentId: 'folder-id', trash: false, search: '中文 目标', selected: 'file-id' };
    expect(parseFilesRoute(filesRoute(location))).toEqual(location);
    expect(parseFilesRoute('/trash?q=trash#selected=item')).toEqual({
      parentId: null,
      trash: true,
      search: 'trash',
      selected: 'item'
    });
    expect(parseFilesRoute('/')).toEqual({ parentId: null, trash: false, search: '', selected: null });
    expect(() => parseFilesRoute('/unsupported/path')).toThrow('UNSUPPORTED');
  });
});
