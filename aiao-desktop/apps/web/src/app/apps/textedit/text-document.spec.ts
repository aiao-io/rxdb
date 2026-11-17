import { describe, expect, it, vi } from 'vitest';

import type { AppContextFiles, FileSnapshot } from '../../services/app-files';
import { SaveLocation, TextDocument } from './text-document';

const PATH = ['Users', 'prasenjit', 'Documents', 'note.txt'];
const COPY = ['Users', 'prasenjit', 'Documents', 'copy.txt'];
const stamp = { modified: 100, size: 3 };
const snapshot: FileSnapshot = { kind: 'ok', stamp, bytes: new TextEncoder().encode('old') };

function setup() {
  const files = {
    snapshot: vi.fn<AppContextFiles['snapshot']>().mockResolvedValue(snapshot),
    replace: vi.fn<AppContextFiles['replace']>().mockResolvedValue({ kind: 'ok', stamp: { modified: 101, size: 9 } }),
    create: vi.fn<AppContextFiles['create']>().mockResolvedValue({ kind: 'ok', stamp: { modified: 101, size: 9 } })
  };
  const choose = vi
    .fn<(name: string) => Promise<SaveLocation | null>>()
    .mockResolvedValue({ path: COPY, replace: false });
  return { files, choose, doc: new TextDocument(files, choose) };
}

it('新文档选位置后保存中文和 emoji，更新名称与已保存状态', async () => {
  const { doc, files, choose } = setup();
  doc.edit('文档 🌏');
  expect(await doc.save()).toBe(true);
  expect(choose).toHaveBeenCalledExactlyOnceWith('Untitled.txt');
  expect(files.create).toHaveBeenCalledExactlyOnceWith(COPY, new TextEncoder().encode('文档 🌏'), false);
  expect(doc.name()).toBe('copy.txt');
  expect(doc.dirty()).toBe(false);
});

it('取消保存面板保留草稿且没有错误和写入', async () => {
  const { doc, files, choose } = setup();
  choose.mockResolvedValue(null);
  doc.edit('draft');
  expect(await doc.save()).toBe(false);
  expect(choose).toHaveBeenCalledTimes(1);
  expect(doc.text()).toBe('draft');
  expect(doc.status()).toBe('new');
  expect(doc.error()).toBeNull();
  expect(files.create).not.toHaveBeenCalled();
});

it('另存为创建副本，既有文件不覆盖', async () => {
  const { doc, files } = setup();
  await doc.load(PATH);
  doc.edit('copy');
  expect(await doc.save(true)).toBe(true);
  expect(files.replace).not.toHaveBeenCalled();
  expect(files.create).toHaveBeenCalledWith(COPY, new TextEncoder().encode('copy'), false);
  expect(doc.path()).toEqual(COPY);
});

it('保存传入打开时版本，冲突保留草稿并允许另存副本', async () => {
  const { doc, files } = setup();
  await doc.load(PATH);
  doc.edit('my changes');
  files.replace.mockResolvedValue({ kind: 'changed' });
  expect(await doc.save()).toBe(false);
  expect(files.replace).toHaveBeenCalledWith(PATH, expect.any(Uint8Array), stamp);
  expect(doc.status()).toBe('conflict');
  expect(doc.dirty()).toBe(true);
  expect(doc.error()).toContain('changed');
  expect(await doc.save(true)).toBe(true);
});

it('写入期间新编辑保留为未保存，重复保存共用同一次写入', async () => {
  const { doc, files } = setup();
  await doc.load(PATH);
  doc.edit('first');
  let finish!: (result: Awaited<ReturnType<AppContextFiles['replace']>>) => void;
  files.replace.mockImplementation(() => new Promise(resolve => (finish = resolve)));
  const first = doc.save();
  const again = doc.save();
  expect(doc.status()).toBe('saving');
  expect(files.replace).toHaveBeenCalledTimes(1);
  doc.edit('second');
  finish({ kind: 'ok', stamp: { modified: 101, size: 5 } });
  expect(await first).toBe(true);
  expect(await again).toBe(true);
  expect(doc.text()).toBe('second');
  expect(doc.savedText()).toBe('first');
  expect(doc.dirty()).toBe(true);
});

it('配额失败保留旧版本和草稿，重试成功才清除未保存状态', async () => {
  const { doc, files } = setup();
  await doc.load(PATH);
  doc.edit('retry');
  files.replace.mockRejectedValueOnce(new Error('Quota exceeded'));
  expect(await doc.save()).toBe(false);
  expect(doc.error()).toContain('Quota exceeded');
  expect(doc.savedText()).toBe('old');
  expect(doc.stamp()).toEqual(stamp);
  expect(doc.dirty()).toBe(true);
  expect(await doc.save()).toBe(true);
  expect(doc.dirty()).toBe(false);
  expect(doc.error()).toBeNull();
});

it('迟到读取不覆盖开始读取后的新编辑', async () => {
  const { doc, files } = setup();
  let finish!: (value: FileSnapshot) => void;
  files.snapshot.mockImplementation(() => new Promise(resolve => (finish = resolve)));
  const reading = doc.load(PATH);
  doc.edit('keep this');
  finish(snapshot);
  expect(await reading).toBe(false);
  expect(doc.text()).toBe('keep this');
  expect(doc.dirty()).toBe(true);
});

describe('文件读取与写入失败', () => {
  it.each(['missing', 'too-large'] as const)('读取 %s 保留原稿并显示错误', async kind => {
    const { doc, files } = setup();
    doc.edit('keep');
    files.snapshot.mockResolvedValue(kind === 'missing' ? { kind } : { kind, size: 20_000_000 });
    expect(await doc.load(PATH)).toBe(false);
    expect(doc.text()).toBe('keep');
    expect(doc.status()).toBe('failed');
    expect(doc.error()).toBeTruthy();
  });

  it.each(['exists', 'missing-folder'] as const)('另存 %s 失败不修改当前文件身份', async kind => {
    const { doc, files } = setup();
    await doc.load(PATH);
    doc.edit('keep');
    files.create.mockResolvedValue({ kind });
    expect(await doc.save(true)).toBe(false);
    expect(doc.path()).toEqual(PATH);
    expect(doc.dirty()).toBe(true);
    expect(doc.error()).toBeTruthy();
  });
});

it('初次打开失败仍保留原文件身份，不把失败加载当成新空白文档', async () => {
  const { files, choose } = setup();
  files.snapshot.mockRejectedValue(new Error('read failed'));
  const doc = new TextDocument(files, choose, PATH);
  expect(await doc.load(PATH)).toBe(false);
  expect(doc.path()).toEqual(PATH);
  expect(doc.name()).toBe('note.txt');
  expect(await doc.save()).toBe(false);
  expect(files.replace).not.toHaveBeenCalled();
  expect(choose).not.toHaveBeenCalled();
});

it('销毁后晚到读取不更新文档，取消后来的保存', async () => {
  const { doc, files } = setup();
  let finish!: (value: FileSnapshot) => void;
  files.snapshot.mockImplementation(() => new Promise(resolve => (finish = resolve)));
  const reading = doc.load(PATH);
  doc.dispose();
  finish(snapshot);
  expect(await reading).toBe(false);
  expect(doc.text()).toBe('');
  expect(await doc.save()).toBe(false);
  expect(files.create).not.toHaveBeenCalled();
});

it('非法 UTF-8 读取失败不更换现有文档与版本', async () => {
  const { doc, files } = setup();
  await doc.load(PATH);
  files.snapshot.mockResolvedValue({ kind: 'ok', stamp: { modified: 999, size: 1 }, bytes: new Uint8Array([255]) });
  expect(await doc.load(COPY)).toBe(false);
  expect(doc.path()).toEqual(PATH);
  expect(doc.text()).toBe('old');
  expect(doc.stamp()).toEqual(stamp);
});
