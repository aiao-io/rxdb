import { describe, expect, it } from 'vitest';

import { isSameOrigin, resolveUrl } from './safari-url';

const DESKTOP = 'https://desktop.example.com';

describe('isSameOrigin', () => {
  it('同一来源的任何路径、查询串与锚点都算同源', () => {
    for (const url of [
      'https://desktop.example.com',
      'https://desktop.example.com/',
      'https://desktop.example.com/saltline.html',
      'https://desktop.example.com/a/b?c=1#d'
    ])
      expect(isSameOrigin(url, DESKTOP), url).toBe(true);
  });

  it('主机名大小写、默认端口与用户名密码的写法不会改变来源', () => {
    for (const url of [
      'https://DESKTOP.Example.COM/x',
      'https://desktop.example.com:443/x',
      'https://user:pass@desktop.example.com/x'
    ])
      expect(isSameOrigin(url, DESKTOP), url).toBe(true);
  });

  it('地址栏里补全协议之后判断：裸主机名也认得出', () => {
    expect(isSameOrigin(resolveUrl('desktop.example.com/saltline.html'), DESKTOP)).toBe(true);
    expect(isSameOrigin(resolveUrl('other.example.com/saltline.html'), DESKTOP)).toBe(false);
  });

  it('协议、端口或主机不同就是跨源：子域、上级域、不同端口、http', () => {
    for (const url of [
      'http://desktop.example.com/x',
      'https://desktop.example.com:8443/x',
      'https://www.desktop.example.com/x',
      'https://example.com/x',
      'https://other.example.net/x'
    ])
      expect(isSameOrigin(url, DESKTOP), url).toBe(false);
  });

  it('长得像桌面地址、实际指向别处的写法不算同源', () => {
    for (const url of [
      'https://desktop.example.com.evil.net/x',
      'https://desktop.example.com@evil.net/x',
      'https://evil.net/https://desktop.example.com/x',
      'https://evil.net/?next=https://desktop.example.com'
    ])
      expect(isSameOrigin(url, DESKTOP), url).toBe(false);
  });

  it('桌面带端口时，端口也要一致', () => {
    expect(isSameOrigin('https://desktop.example.com:8443/x', 'https://desktop.example.com:8443')).toBe(true);
    expect(isSameOrigin('https://desktop.example.com/x', 'https://desktop.example.com:8443')).toBe(false);
  });

  it('解析不了的地址不是同源（浏览器也加载不了它）', () => {
    expect(isSameOrigin('https://exa mple.com/', DESKTOP)).toBe(false);
    expect(isSameOrigin('https://', DESKTOP)).toBe(false);
  });

  it('从磁盘打开的桌面来源是 "null"，不能拿它去匹配其他不透明来源', () => {
    expect(isSameOrigin('https://desktop.example.com/x', 'null')).toBe(false);
    expect(isSameOrigin('data:text/html,hi', 'null')).toBe(false);
  });
});
