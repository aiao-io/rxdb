// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { buildPreviewDocument, isPreviewEvent, prepareProjectHTML } from './preview-sandbox.js';

describe('隔离预览文档', () => {
  it('保留 HTML 正文，移除唯一受控入口并内联本地图片', () => {
    const result = prepareProjectHTML({
      entry: 'src/main.ts',
      files: {
        'index.html':
          '<!doctype html><html><head><style>h1 { color: red; }</style><link rel="stylesheet" href="./src/style.css"></head><body><h1>项目</h1><img src="./icon.svg"><script type="module" src="/src/main.ts"></script></body></html>',
        'icon.svg': '<svg/>',
        'src/style.css': 'body{}'
      }
    });
    expect(result.html).toContain('<h1>项目</h1>');
    expect(result.html).toContain('data:image/svg+xml;base64,');
    expect(result.html).not.toContain('<script');
    expect(result.styles).toEqual(['src/style.css']);
    expect(result.inlineCSS).toContain('color: red');
  });

  it.each([
    '<script src="https://cdn.invalid/evil.js"></script>',
    '<script>alert(1)</script>',
    '<link rel="stylesheet" href="https://cdn.invalid/style.css">',
    '<img src="https://host.invalid/private">',
    '<a href="https://host.invalid/private">跳转</a>',
    '<iframe src="/other-project"></iframe>',
    '<base href="https://host.invalid">'
  ])('拒绝绕过快照的 HTML：%s', html => {
    expect(() => prepareProjectHTML({ entry: 'main.ts', files: { 'index.html': html } })).toThrow();
  });

  it('脚本和样式内容不能提前关闭安全引导标签', () => {
    const document = buildPreviewDocument({
      sessionId: 'session',
      projectId: 'project',
      revision: 3,
      js: 'console.log("</script><script>evil()</script>")',
      css: '</style><script>evil()</script>',
      html: '<div id="app"></div>',
      imports: { react: 'https://preview.test/vendor/react.js' }
    });
    expect(document).not.toContain('<script>evil()');
    expect(document).toContain('connect-src');
    expect(document).toContain("default-src 'none'");
    expect(document).not.toContain("'unsafe-eval'");
    expect(document).toContain('https://preview.test/vendor/');
    expect(document).not.toContain('https://preview.test;');
  });

  it('Angular 可在预览内单独启用 JIT，不授予宿主存储权限', () => {
    const document = buildPreviewDocument({
      sessionId: 'session',
      projectId: 'project',
      revision: 1,
      js: '',
      css: '',
      allowEval: true
    });
    expect(document).toContain("'unsafe-eval'");
    expect(document).not.toContain('allow-same-origin');
  });

  it('拒绝将整个 IDE 站点或动态 URL 授权为脚本来源', () => {
    const identity = { sessionId: 'session', projectId: 'project', revision: 1, js: '', css: '' };
    expect(() => buildPreviewDocument({ ...identity, imports: { react: 'https://ide.test/react.js' } })).toThrow(
      '独立静态资源目录'
    );
    expect(() =>
      buildPreviewDocument({ ...identity, imports: { react: 'https://ide.test/runtime/react.js?latest' } })
    ).toThrow('固定');
  });

  it('消息必须匹配完整的运行身份与受限类型', () => {
    const identity = { sessionId: 'abc', projectId: 'p', revision: 2 };
    expect(isPreviewEvent({ ...identity, type: 'console', level: 'log', values: ['hello'] }, identity)).toBe(true);
    expect(isPreviewEvent({ ...identity, revision: 1, type: 'ready' }, identity)).toBe(false);
    expect(isPreviewEvent({ ...identity, type: 'writeFile', values: ['.git/config'] }, identity)).toBe(false);
    expect(isPreviewEvent({ ...identity, type: 'console', level: 'log', values: 'bad' }, identity)).toBe(false);
  });

  it('HTML 缺席时提供入口，二进制入口与图片按原字节读取', () => {
    expect(prepareProjectHTML({ entry: 'main.ts', files: {} })).toEqual({
      html: '<div id="app"></div>',
      styles: [],
      inlineCSS: ''
    });
    const result = prepareProjectHTML({
      entry: 'main.ts',
      files: {
        'index.html': new TextEncoder().encode(
          '<img src="./icon.png"><a href="#target">跳转</a><svg><use href="#symbol"></use></svg>'
        ),
        'icon.png': new Uint8Array([137, 80, 78, 71])
      }
    });
    expect(result.html).toContain('data:image/png;base64,iVBORw==');
    expect(result.html).toContain('href="#target"');
    expect(result.html).toContain('href="#symbol"');
  });

  it.each([
    '<script src="main.ts"></script>',
    '<script type="module" src="main.ts"></script><script type="module" src="main.ts"></script>',
    '<link rel="prefetch" href="main.ts">',
    '<link rel="stylesheet" href="missing.css">',
    '<img src="../private.png">',
    '<img src=".git/config">',
    '<img src="icon.txt">',
    '<img src="missing.png">',
    '<img src="icon.png?secret">',
    '<button onclick="run()">运行</button>',
    '<img srcset="icon.png 1x">',
    '<div nonce="override"></div>',
    '<template><script>run()</script></template>'
  ])('HTML 明确拒绝不支持或越界的能力：%s', html => {
    expect(() =>
      prepareProjectHTML({ entry: 'main.ts', files: { 'index.html': html, 'icon.txt': '', 'icon.png': '' } })
    ).toThrow();
  });

  it.each([
    null,
    1,
    {},
    { type: 'ready' },
    { sessionId: 's', projectId: 'other', revision: 1, type: 'ready' },
    { sessionId: 's', projectId: 'p', revision: 1, type: 'error', message: 'error' },
    { sessionId: 's', projectId: 'p', revision: 1, type: 'console', level: 'trace', values: [] },
    { sessionId: 's', projectId: 'p', revision: 1, type: 'console', level: 'log', values: [1] }
  ])('拒绝畸形消息：%s', value => {
    expect(isPreviewEvent(value, { sessionId: 's', projectId: 'p', revision: 1 })).toBe(false);
  });

  it('当前会话的运行异常可以携带调用栈', () => {
    const identity = { sessionId: 's', projectId: 'p', revision: 'revision-1' };
    expect(isPreviewEvent({ ...identity, type: 'error', message: 'failed', stack: 'main.ts:1' }, identity)).toBe(true);
  });
});
