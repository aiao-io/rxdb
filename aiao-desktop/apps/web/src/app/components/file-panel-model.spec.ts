import { describe, expect, it } from 'vitest';

import { HOME } from '../disk/disk-path';
import { FsNode } from '../disk/disk-tree';
import { fileNode, folderNode } from '../testing/nodes';
import {
  PanelEntry,
  acceptsName,
  fileNameProblem,
  moveActive,
  nearestFolder,
  panelEntries,
  pathLabel,
  saveConflict,
  startFolder
} from './file-panel-model';

const sized = (name: string, bytes: number): FsNode => ({ ...fileNode(name), bytes });
const names = (entries: readonly PanelEntry[]): string[] => entries.map(entry => entry.name);
const options = { mode: 'open', accept: [], maxBytes: 1_000 } as const;

describe('acceptsName：accept 只做显示过滤（扩展名与 MIME）', () => {
  it('没有 accept 就都显示；扩展名不分大小写、要完全匹配；没有扩展名的文件匹配不了扩展名', () => {
    expect(acceptsName([], 'anything.bin')).toBe(true);
    expect(acceptsName(['.md'], 'notes.md')).toBe(true);
    expect(acceptsName(['.md'], 'NOTES.MD')).toBe(true);
    expect(acceptsName(['.md'], 'notes.markdown')).toBe(false);
    expect(acceptsName(['.md'], 'md')).toBe(false);
    expect(acceptsName(['.md'], '.md')).toBe(false);
    expect(acceptsName(['.md', '.txt'], 'a.txt')).toBe(true);
  });

  it('MIME 类型按扩展名推断：text/* 是一类，image/png 是一种；没有扩展名的文件当作文本', () => {
    expect(acceptsName(['text/*'], 'a.md')).toBe(true);
    expect(acceptsName(['text/*'], 'a.json')).toBe(false);
    expect(acceptsName(['text/*'], 'README')).toBe(true);
    expect(acceptsName(['image/*'], 'a.png')).toBe(true);
    expect(acceptsName(['image/png'], 'a.png')).toBe(true);
    expect(acceptsName(['image/png'], 'a.jpg')).toBe(false);
    expect(acceptsName(['application/json'], 'a.json')).toBe(true);
    expect(acceptsName(['application/*'], 'a.pdf')).toBe(true);
    expect(acceptsName(['image/png', '.md'], 'a.md')).toBe(true);
  });
});

describe('panelEntries：面板里的条目', () => {
  const folder = folderNode('Docs', [
    fileNode('b.md'),
    folderNode('Sub', [], ['Users', 'Docs', 'Sub']),
    fileNode('a.txt'),
    fileNode('.hidden.md'),
    folderNode('.git', [], ['Users', 'Docs', '.git']),
    sized('big.md', 5_000),
    sized('edge.md', 1_000)
  ]);

  it('文件夹在前、文件在后，各自保持名字顺序；隐藏文件与隐藏文件夹不显示', () => {
    expect(names(panelEntries(folder, options))).toEqual(['Sub', 'b.md', 'a.txt', 'big.md', 'edge.md']);
  });

  it('accept 过滤文件、不过滤文件夹（要能进到别的文件夹里去找）', () => {
    expect(names(panelEntries(folder, { ...options, accept: ['.md'] }))).toEqual(['Sub', 'b.md', 'big.md', 'edge.md']);
    expect(names(panelEntries(folder, { ...options, accept: ['.pdf'] }))).toEqual(['Sub']);
  });

  it('打开：超过大小上限的文件禁用并说明原因，刚好等于上限的可以选；文件夹从不禁用', () => {
    const entries = panelEntries(folder, options);
    const big = entries.find(entry => entry.name === 'big.md')!;
    expect(big).toMatchObject({ disabled: true });
    expect(big.reason).toBe('Too large — the limit is 1 KB');
    expect(entries.find(entry => entry.name === 'edge.md')).toMatchObject({ disabled: false, reason: null });
    expect(entries.find(entry => entry.name === 'Sub')).toMatchObject({ disabled: false, folder: true });
  });

  it('保存：大文件不禁用（它们的名字可以被选来覆盖），程序包两种面板里都不能选', () => {
    const withApp = folderNode('Apps', [sized('big.md', 5_000), { ...fileNode('Mail.app'), bytes: 10 }]);
    const open = panelEntries(withApp, options);
    expect(open.find(entry => entry.name === 'Mail.app')).toMatchObject({ disabled: true });
    expect(open.find(entry => entry.name === 'Mail.app')?.reason).toMatch(/can’t be opened/);
    const save = panelEntries(withApp, { ...options, mode: 'save' });
    expect(save.find(entry => entry.name === 'big.md')).toMatchObject({ disabled: false, reason: null });
    expect(save.find(entry => entry.name === 'Mail.app')).toMatchObject({ disabled: true });
    expect(save.find(entry => entry.name === 'Mail.app')?.reason).toMatch(/can’t be replaced/);
  });

  it('没有文件夹（已被删除）时没有条目', () => {
    expect(panelEntries(null, options)).toEqual([]);
  });
});

describe('moveActive：方向键只用来在条目间移动', () => {
  it('上下各移一行，到头就停在头，不绕圈；Home、End 到头与尾', () => {
    expect(moveActive(3, 0, 'ArrowDown')).toBe(1);
    expect(moveActive(3, 2, 'ArrowDown')).toBe(2);
    expect(moveActive(3, 2, 'ArrowUp')).toBe(1);
    expect(moveActive(3, 0, 'ArrowUp')).toBe(0);
    expect(moveActive(3, 1, 'Home')).toBe(0);
    expect(moveActive(3, 1, 'End')).toBe(2);
  });

  it('还没有当前行时：向下选第一行，向上选最后一行；没有条目时没有当前行', () => {
    expect(moveActive(3, -1, 'ArrowDown')).toBe(0);
    expect(moveActive(3, -1, 'ArrowUp')).toBe(2);
    expect(moveActive(0, -1, 'ArrowDown')).toBe(-1);
    expect(moveActive(0, 0, 'End')).toBe(-1);
  });
});

describe('fileNameProblem：保存的文件名', () => {
  it('空名字、只有空白、路径分隔符、点与点点、控制字符、超长都有一句说明；正常的名字没有问题', () => {
    expect(fileNameProblem('notes.md', 255)).toBeNull();
    expect(fileNameProblem('with space.txt', 255)).toBeNull();
    expect(fileNameProblem('.hidden', 255)).toBeNull();
    expect(fileNameProblem('', 255)).toMatch(/Enter a name/);
    expect(fileNameProblem('   ', 255)).toMatch(/Enter a name/);
    expect(fileNameProblem('a/b', 255)).toMatch(/“\/”/);
    expect(fileNameProblem('a\\b', 255)).toMatch(/“\/”/);
    expect(fileNameProblem('.', 255)).toMatch(/isn’t a valid/);
    expect(fileNameProblem('..', 255)).toMatch(/isn’t a valid/);
    expect(fileNameProblem('a\u0007b', 255)).toMatch(/control characters/);
    expect(fileNameProblem('x'.repeat(256), 255)).toMatch(/at most 255/);
    expect(fileNameProblem('x'.repeat(255), 255)).toBeNull();
  });
});

describe('saveConflict：保存的目标与现有条目', () => {
  const folder = folderNode('Docs', [
    fileNode('a.md'),
    folderNode('Sub', [], ['Users', 'Docs', 'Sub']),
    { ...fileNode('Mail.app'), bytes: 1 },
    fileNode('.secret'),
    fileNode('other.pdf')
  ]);

  it('新名字没有冲突；同名文件要请用户确认覆盖；同名文件夹与程序包不能覆盖', () => {
    expect(saveConflict(folder, 'new.md')).toEqual({ kind: 'none' });
    expect(saveConflict(folder, 'a.md')).toEqual({ kind: 'file' });
    expect(saveConflict(folder, 'Sub')).toEqual({ kind: 'folder' });
    expect(saveConflict(folder, 'Mail.app')).toEqual({ kind: 'package' });
  });

  it('看文件夹里的全部条目：隐藏文件、被 accept 过滤掉的文件也算冲突，不会在看不见的地方静默覆盖', () => {
    expect(saveConflict(folder, '.secret')).toEqual({ kind: 'file' });
    expect(saveConflict(folder, 'other.pdf')).toEqual({ kind: 'file' });
    expect(saveConflict(folder, 'A.md')).toEqual({ kind: 'none' });
  });

  it('文件夹已经不在了：没有冲突（之后的写入会因为目标文件夹不在而不写）', () => {
    expect(saveConflict(null, 'a.md')).toEqual({ kind: 'none' });
  });
});

describe('位置', () => {
  const tree = folderNode('Macintosh HD', [
    folderNode(
      'Users',
      [folderNode('prasenjit', [folderNode('Documents', [], [...HOME, 'Documents'])], [...HOME])],
      ['Users']
    )
  ]);
  const nodeAt = (path: readonly string[]): FsNode | null => {
    let node: FsNode | null = { ...tree, path: [] };
    for (const name of path) node = node?.children?.find(child => child.name === name) ?? null;
    return node;
  };

  it('路径的显示文字从卷名开始', () => {
    expect(pathLabel([])).toBe('Macintosh HD');
    expect(pathLabel(['Users', 'prasenjit'])).toBe('Macintosh HD › Users › prasenjit');
  });

  it('最近的还在的文件夹：用户所在的文件夹被删掉就退到上级，一直退到卷根；文件不算文件夹', () => {
    expect(nearestFolder([...HOME, 'Documents'], nodeAt)).toEqual([...HOME, 'Documents']);
    expect(nearestFolder([...HOME, 'Documents', 'Gone', 'Deeper'], nodeAt)).toEqual([...HOME, 'Documents']);
    expect(nearestFolder(['Gone', 'Deeper'], nodeAt)).toEqual([]);
  });

  it('面板一开始停在 Documents，没有就是主目录，再没有就是卷根', () => {
    expect(startFolder(nodeAt)).toEqual([...HOME, 'Documents']);
    expect(startFolder(path => (path.length <= 2 ? nodeAt(path) : null))).toEqual(HOME);
    expect(startFolder(() => null)).toEqual([]);
  });
});
