import { describe, expect, it } from 'vitest';

import { filePathOf, fileUrlOf, isSameOrigin, kindOf, resolveUrl, titleFor } from './safari-url';

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

describe('file 地址与卷内路径（D-28）', () => {
  it('fileUrlOf 逐段编码路径，filePathOf 原样解回', () => {
    const path = ['Projects', 'desktop-web', 'my page #1.html'];
    expect(filePathOf(fileUrlOf(path))).toEqual(path);
  });

  it('地址栏里的 file 地址归类为 file，标题取文件名', () => {
    const url = fileUrlOf(['Desktop', 'hello.html']);
    expect(kindOf(url)).toBe('file');
    expect(titleFor(url)).toBe('hello.html');
  });

  it('不是 file 地址、或解码不了的地址取不到路径', () => {
    expect(filePathOf('https://example.com/a.html')).toBeUndefined();
    expect(filePathOf('file:///bad%zz.html')).toBeUndefined();
    expect(filePathOf('file:///')).toBeUndefined();
  });

  it('没有 file:// 前缀的普通文件名不进 file 分支，仍按既有规则归类', () => {
    expect(kindOf('page.html')).toBe('web');
  });
});
