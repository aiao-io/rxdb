import { describe, expect, it } from 'vitest';
import { documentRoute, parseEditorRoute } from './editor-navigation.js';

describe('DESKTOP-US-305/501 文档位置恢复', () => {
  it('文档身份、行 query 与 hash 往返，不依赖其他窗口的文件引用', () => {
    const route = documentRoute('document-id', 2);
    expect(route).toBe('/documents/document-id?line=2#L2');
    expect(parseEditorRoute(route)).toEqual({ fileId: 'document-id', line: 2 });
    expect(parseEditorRoute('')).toEqual({ fileId: null, line: 1 });
    expect(parseEditorRoute('/#L3')).toEqual({ fileId: null, line: 3 });
  });
  it.each(['/missing', '/documents/a/b', '/?line=0', '/?line=bad', '/?line=1.5'])('无效位置 %s 明确拒绝', route => {
    expect(() => parseEditorRoute(route)).toThrow(/INVALID|UNSUPPORTED/);
  });
});
