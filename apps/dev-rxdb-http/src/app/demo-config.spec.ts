import { describe, expect, it } from 'vitest';
import { DEFAULT_API_BASE_URL, resolveApiBaseUrl } from './demo-config';

describe('resolveApiBaseUrl', () => {
  it('没带 ?api= 时用默认后端', () => {
    expect(resolveApiBaseUrl('')).toBe(DEFAULT_API_BASE_URL);
    expect(resolveApiBaseUrl('?diagnostics=1')).toBe(DEFAULT_API_BASE_URL);
    expect(resolveApiBaseUrl('?api=')).toBe(DEFAULT_API_BASE_URL);
  });

  it('接受回环地址的任意端口与路径', () => {
    expect(resolveApiBaseUrl('?api=http://127.0.0.1:9999/v1')).toBe('http://127.0.0.1:9999/v1');
    expect(resolveApiBaseUrl('?api=http://localhost:8317/v1')).toBe('http://localhost:8317/v1');
    expect(resolveApiBaseUrl('?api=http://[::1]:4301/v1')).toBe('http://[::1]:4301/v1');
    expect(resolveApiBaseUrl('?api=https://127.0.0.1/v1')).toBe('https://127.0.0.1/v1');
  });

  it('末尾斜杠照旧去掉', () => {
    expect(resolveApiBaseUrl('?api=http://127.0.0.1:4301/v1///')).toBe('http://127.0.0.1:4301/v1');
  });

  /**
   * `?api=` 是一条完全由 URL 决定的 `fetch` 目标（CodeQL `js/client-side-request-forgery`）。
   * 一条构造好的链接就能让页面把本地数据打去别人家的服务器，且发起方是受害者自己的浏览器。
   * 这个 demo 的所有真实用法都在回环上（README 的例子、e2e 的 `127.0.0.1:8317`），
   * 收紧到回环不损失任何已文档化的能力。
   */
  it('拒绝非回环主机', () => {
    expect(() => resolveApiBaseUrl('?api=https://evil.example.com/v1')).toThrow(/回环/);
    expect(() => resolveApiBaseUrl('?api=http://127.0.0.1.evil.example.com/v1')).toThrow(/回环/);
    expect(() => resolveApiBaseUrl('?api=http://user@evil.example.com/v1')).toThrow(/回环/);
    expect(() => resolveApiBaseUrl('?api=//evil.example.com/v1')).toThrow(/回环/);
  });

  it('拒绝非 http(s) 协议', () => {
    expect(() => resolveApiBaseUrl('?api=javascript:alert(1)')).toThrow(/回环/);
    expect(() => resolveApiBaseUrl('?api=data:text/plain,x')).toThrow(/回环/);
    expect(() => resolveApiBaseUrl('?api=file://localhost/etc/passwd')).toThrow(/回环/);
  });

  it('拒绝根本解析不出来的值', () => {
    expect(() => resolveApiBaseUrl('?api=not a url')).toThrow(/回环/);
  });

  /** 查询串与 hash 不属于 baseUrl，留着只会被适配器拼进路径里。 */
  it('丢掉查询串与 hash', () => {
    expect(resolveApiBaseUrl('?api=' + encodeURIComponent('http://127.0.0.1:4301/v1?x=1#y'))).toBe(
      'http://127.0.0.1:4301/v1'
    );
  });
});
