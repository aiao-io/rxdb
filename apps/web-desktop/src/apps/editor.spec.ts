import { describe, expect, it } from 'vitest';
import { encodeText } from '../core/bytes.js';
import type { VirtualFile } from '../core/types.js';
import { EditorDocument } from './editor.js';

const saved = (text: string, revision = 1): VirtualFile => ({
  id: 'file',
  name: '笔记.txt',
  bytes: encodeText(text),
  revision,
  parentId: null,
  kind: 'file',
  mime: 'text/plain',
  modified: 0,
  trashId: null,
  deleted: false
});

describe('DESKTOP-US-602 文档保存快照与历史', () => {
  it('撤销重做仅影响当前实例，保存后才清除脏状态', async () => {
    const a = new EditorDocument();
    const b = new EditorDocument();
    a.edit('中文');
    a.edit('中文内容');
    a.undo();
    expect(a.text).toBe('中文');
    a.redo();
    expect(a.text).toBe('中文内容');
    expect(b.text).toBe('');
    await a.save(async () => saved(a.text));
    expect(a.dirty).toBe(false);
    expect(a.fileId).toBe('file');
  });
  it('保存失败不清除脏状态，失败期间内容保持', async () => {
    const doc = new EditorDocument();
    doc.edit('未保存');
    await expect(
      doc.save(async () => {
        throw new Error('CONFLICT');
      })
    ).rejects.toThrow('CONFLICT');
    expect(doc.dirty).toBe(true);
    expect(doc.text).toBe('未保存');
  });
  it('保存过程中继续输入，提交旧快照后仍为脏状态', async () => {
    const doc = new EditorDocument();
    doc.edit('旧快照');
    let complete: (file: VirtualFile) => void = () => undefined;
    const pending = doc.save(
      () =>
        new Promise(resolve => {
          complete = resolve;
        })
    );
    doc.edit('继续输入的新内容');
    complete(saved('旧快照'));
    await pending;
    expect(doc.text).toBe('继续输入的新内容');
    expect(doc.dirty).toBe(true);
  });
  it('加载稳定文件身份，丢弃编辑恢复最近保存内容', () => {
    const doc = new EditorDocument();
    doc.load(saved('已保存', 3));
    doc.edit('临时编辑');
    doc.discard();
    expect(doc.text).toBe('已保存');
    expect(doc.revision).toBe(3);
    expect(doc.dirty).toBe(false);
  });
  it('另存为在所选目录创建新名称，保留原文件身份的已保存内容', async () => {
    const doc = new EditorDocument();
    const original = saved('旧正文');
    doc.load(original);
    doc.edit('新正文');
    await doc.save(
      async snapshot => {
        expect(snapshot).toMatchObject({ name: '新副本.txt', parentId: 'directory', fileId: null });
        return { ...saved('新正文'), id: 'copy', name: snapshot.name, parentId: snapshot.parentId };
      },
      true,
      { name: '新副本.txt', parentId: 'directory' }
    );
    expect(doc).toMatchObject({ fileId: 'copy', name: '新副本.txt', parentId: 'directory', dirty: false });
    expect(original.bytes).toBe(encodeText('旧正文'));
  });
});

describe('DESKTOP-US-305/602 等待打开时的编辑保护', () => {
  it.each(['edit', 'rename'] as const)('读取未完成时继续 %s，迟到文档不能覆盖当前内容', async action => {
    const doc = new EditorDocument();
    doc.load(saved('原文'));
    let finish: (file: VirtualFile) => void = () => undefined;
    const pending = doc.open(
      () =>
        new Promise<VirtualFile>(resolve => {
          finish = resolve;
        })
    );
    if (action === 'edit') doc.edit('读取期间的新草稿');
    else doc.rename('读取期间的新名称.txt');
    const before = { text: doc.text, name: doc.name, fileId: doc.fileId, revision: doc.revision };
    const rejected = expect(pending).rejects.toThrow('CONFLICT');
    finish({ ...saved('迟到内容'), id: 'other' });
    await rejected;
    expect({ text: doc.text, name: doc.name, fileId: doc.fileId, revision: doc.revision }).toEqual(before);
    expect(doc.dirty).toBe(true);
  });
  it('读取取消或失败不提交目标文档', async () => {
    const doc = new EditorDocument();
    doc.load(saved('原文'));
    const controller = new AbortController();
    await expect(
      doc.open(async () => {
        controller.abort(new Error('CANCELLED'));
        return saved('新内容');
      }, controller.signal)
    ).rejects.toThrow('CANCELLED');
    await expect(
      doc.open(async () => {
        throw new Error('NOT_FOUND');
      })
    ).rejects.toThrow('NOT_FOUND');
    expect(doc.text).toBe('原文');
    expect(doc.dirty).toBe(false);
  });
});
