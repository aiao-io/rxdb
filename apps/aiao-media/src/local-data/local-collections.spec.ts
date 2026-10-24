import { describe, expect, it } from 'vitest';
import { defaultFreeProvider } from '../app/default-provider';
import { createNotebookDraft, emptyNotebook } from './draft-notebook';
import { decodeCollection } from './local-collections';

describe('旧集合的逐条迁移', () => {
  it('保留供应商标识、默认选择和原始存储，由独立行承载公开配置', () => {
    const provider = defaultFreeProvider();
    const source = JSON.stringify({ providers: [provider], defaultId: provider.id });
    const rows = decodeCollection('providers', source);
    expect(rows[0]).toMatchObject({ sourceId: provider.id, position: 0 });
    expect(JSON.parse(rows[0].payload)).toEqual(provider);
    expect(source).toContain(provider.id);
  });
  it('保留 notebook 删除标记、冲突与未确认提交，不清理历史', () => {
    const book = emptyNotebook();
    const id = '00000000-0000-4000-8000-000000000001';
    createNotebookDraft(
      book,
      { kind: 'image', prompt: '保留', requiresReference: false, parameters: { operation: 'text-to-image' } },
      id
    );
    book.drafts[0].deleted = true;
    book.drafts[0].content = null;
    const rows = decodeCollection('drafts', JSON.stringify(book));
    expect(rows[0].sourceId).toBe(id);
    expect(JSON.parse(rows[0].payload).deleted).toBe(true);
  });
  it('拒绝重复身份、损坏任务和不完整提交日志，避免部分导入', () => {
    const provider = defaultFreeProvider();
    expect(() =>
      decodeCollection('providers', JSON.stringify({ providers: [provider, provider], defaultId: provider.id }))
    ).toThrow();
    expect(() => decodeCollection('tasks', '[{"id":"bad","status":"processing"}]')).toThrow();
    expect(() => decodeCollection('image-submissions', '{"version":1}')).toThrow();
  });
});
