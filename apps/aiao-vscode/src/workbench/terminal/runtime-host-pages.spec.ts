import { describe, expect, it } from 'vitest';
import { RUNTIME_HOSTS, runtimeHostsFor } from '../../runtime-hosts/hosts.js';
import { deployedRuntimeHost, pagesHeaders, pagesRedirects, runtimeHostHeaders } from './runtime-host-pages.js';

describe('运行时宿主的托管配置', () => {
  it('宿主页跨源隔离、允许工作台跨源嵌入，只许配置里的工作台来源嵌入', () => {
    expect(runtimeHostHeaders(['https://vscode.aiao.io'])).toEqual({
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Resource-Policy': 'cross-origin',
      'Content-Security-Policy': "frame-ancestors 'self' https://vscode.aiao.io",
      'Service-Worker-Allowed': '/'
    });
  });

  it('没有允许嵌入的工作台来源时报错', () => {
    expect(() => runtimeHostHeaders([])).toThrow('没有允许嵌入的工作台来源');
  });

  it('线上宿主源是部署配置里唯一的非 localhost 宿主源，嵌入来源是指向它的工作台来源', () => {
    expect(
      deployedRuntimeHost({
        'http://localhost:4320': 'http://localhost:4331',
        'https://app.example': 'https://host.example',
        'https://staging.example': 'https://host.example'
      })
    ).toEqual({ origin: 'https://host.example', parents: ['https://app.example', 'https://staging.example'] });
  });

  it('只有本地宿主源时没有线上宿主', () => {
    expect(deployedRuntimeHost({ 'http://localhost:4320': 'http://localhost:4331' })).toBeUndefined();
  });

  it('一种运行时配了多个线上宿主源时报错：一份产物只能带一组嵌入来源', () => {
    expect(() =>
      deployedRuntimeHost({
        'https://a.example': 'https://host-a.example',
        'https://b.example': 'https://host-b.example'
      })
    ).toThrow('多个线上宿主源');
  });

  it('Pages 响应头：全站同一组宿主响应头，带哈希的 /assets/ 长缓存，地址固定的 /vendor/ 每次重新验证', () => {
    expect(pagesHeaders(['https://vscode.aiao.io'])).toBe(
      [
        '# 由 scripts/build-runtime-hosts.mjs 按 src/runtime-hosts/hosts.ts 生成',
        '/*',
        '  Cross-Origin-Opener-Policy: same-origin',
        '  Cross-Origin-Embedder-Policy: require-corp',
        '  Cross-Origin-Resource-Policy: cross-origin',
        "  Content-Security-Policy: frame-ancestors 'self' https://vscode.aiao.io",
        '  Service-Worker-Allowed: /',
        '/assets/*',
        '  Cache-Control: public, max-age=31536000, immutable',
        '/vendor/*',
        '  Cache-Control: no-cache',
        ''
      ].join('\n')
    );
  });

  it('Pages 改写：iframe 直接导航的 .html 原样 200 返回，不被 308 到无扩展名地址', () => {
    expect(pagesRedirects(['/runtime-host.html', '/preview-frame.html'])).toBe(
      [
        '# 由 scripts/build-runtime-hosts.mjs 生成',
        '/runtime-host.html /runtime-host 200',
        '/preview-frame.html /preview-frame 200',
        ''
      ].join('\n')
    );
  });

  it('改写只接受源根下的 .html 页面', () => {
    expect(() => pagesRedirects(['/sw.js'])).toThrow('/sw.js');
    expect(() => pagesRedirects(['/a/index.html'])).toThrow('/a/index.html');
  });

  it('vscode.aiao.io 可选 vivari，宿主在 vscode-vivari.aiao.io；Nodepod 只在本地评估', () => {
    expect(runtimeHostsFor(RUNTIME_HOSTS, 'https://vscode.aiao.io')).toEqual({
      vivari: 'https://vscode-vivari.aiao.io'
    });
    expect(deployedRuntimeHost(RUNTIME_HOSTS.vivari)).toEqual({
      origin: 'https://vscode-vivari.aiao.io',
      parents: ['https://vscode.aiao.io']
    });
    expect(deployedRuntimeHost(RUNTIME_HOSTS.nodepod)).toBeUndefined();
  });
});
