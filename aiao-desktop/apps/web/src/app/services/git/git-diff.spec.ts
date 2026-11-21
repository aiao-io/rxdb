import { describe, expect, it } from 'vitest';
import { gitFileVersion } from './git-diff.js';

describe('Git 精确差异内容', () => {
  it('区分缺失与空文件', () => {
    expect(gitFileVersion(undefined)).toEqual({ exists: false, binary: false, text: null, byteLength: 0 });
    expect(gitFileVersion(new Uint8Array())).toEqual({ exists: true, binary: false, text: '', byteLength: 0 });
  });

  it('保留BOM、CRLF与末尾换行', () => {
    const text = '\uFEFFfirst\r\nlast\r\n';
    const bytes = new TextEncoder().encode(text);
    expect(gitFileVersion(bytes)).toEqual({ exists: true, binary: false, text, byteLength: bytes.length });
  });

  it.each([new Uint8Array([0, 1]), new Uint8Array([255, 254])])('二进制不经有损文本转码', bytes => {
    expect(gitFileVersion(bytes)).toEqual({ exists: true, binary: true, text: null, byteLength: 2 });
  });
});
