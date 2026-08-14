import { describe, expect, it } from 'vitest';

import {
  APP_ENTRY_URL,
  APP_ORIGIN,
  APP_SCHEME,
  HIDE_WINDOW_ENV,
  isAllowedNavigation,
  parseDevServerPort,
  resolveAppAssetPath,
  resolveDevServerPort,
  shouldHideWindow
} from './main.utils';

const APP_INDEX = 'file:///Applications/Demo.app/Contents/Resources/browser/index.html';

describe('isAllowedNavigation', () => {
  // ELEC-01：`file:` URL 的 origin 恒为字符串 "null"，
  // 原实现的 `origin !== origin` 比较恒为 false —— 任意 file: 地址都能放行。
  it.each([
    ['应用目录之外的绝对路径', 'file:///etc/passwd'],
    ['上跳出资源目录', 'file:///Applications/Demo.app/Contents/Resources/../../../../etc/passwd'],
    ['同盘另一个目录', 'file:///tmp/evil.html']
  ])('拒绝应用目录之外的 file: 导航：%s', (_name, target) => {
    expect(isAllowedNavigation(target, APP_INDEX)).toBe(false);
  });

  it('允许应用自身目录内的 file: 导航', () => {
    expect(isAllowedNavigation(APP_INDEX, APP_INDEX)).toBe(true);
    expect(isAllowedNavigation('file:///Applications/Demo.app/Contents/Resources/browser/other.html', APP_INDEX)).toBe(
      true
    );
  });

  it('拒绝跨协议导航', () => {
    expect(isAllowedNavigation('http://evil.example/', APP_INDEX)).toBe(false);
    expect(isAllowedNavigation('file:///etc/passwd', 'http://localhost:4120/')).toBe(false);
  });

  // ELEC-22：`app:` 不是 WHATWG 的 special scheme，Node 的 `new URL('app://-/x').origin`
  // 与 `new URL('app://evil.example/x').origin` **都是字符串 "null"** ——
  // 直接走 origin 比较就是 ELEC-01 那个 file: 恒等陷阱的翻版：任意 app:// 主机都能放行。
  // 主进程这侧用的是 Node 的 URL，它并不知道渲染进程里把 app: 注册成了 standard scheme，
  // 因此必须显式比较 host。
  it('app: 导航按 host 判定而不是 origin', () => {
    expect(isAllowedNavigation(`${APP_ORIGIN}/other.html`, APP_ENTRY_URL)).toBe(true);
    expect(isAllowedNavigation('app://evil.example/index.html', APP_ENTRY_URL)).toBe(false);
    expect(new URL('app://evil.example/x').origin).toBe(new URL(APP_ENTRY_URL).origin);
  });

  it('保留 http 的同源判定', () => {
    expect(isAllowedNavigation('http://localhost:4120/home', 'http://localhost:4120/')).toBe(true);
    expect(isAllowedNavigation('http://localhost:4121/', 'http://localhost:4120/')).toBe(false);
    expect(isAllowedNavigation('https://localhost:4120/', 'http://localhost:4120/')).toBe(false);
  });

  // 原实现的 `new URL()` 在回调里没有 try/catch，非法 URL 会直接抛进 Electron 事件循环
  it.each([
    ['非法目标 URL', 'not a url', APP_INDEX],
    ['非法当前 URL', APP_INDEX, 'not a url'],
    ['当前 URL 缺失', APP_INDEX, undefined]
  ])('无法解析时拒绝且不抛错：%s', (_name, target, current) => {
    expect(() => isAllowedNavigation(target, current)).not.toThrow();
    expect(isAllowedNavigation(target, current)).toBe(false);
  });
});

describe('resolveAppAssetPath', () => {
  const ROOT = '/Applications/Demo.app/Contents/Resources/browser';

  it('入口常量自洽', () => {
    expect(APP_ORIGIN).toBe(`${APP_SCHEME}://-`);
    expect(APP_ENTRY_URL).toBe(`${APP_ORIGIN}/index.html`);
  });

  it.each([
    ['入口文档', `${APP_ORIGIN}/index.html`, `${ROOT}/index.html`],
    ['目录根回落到 index.html', `${APP_ORIGIN}/`, `${ROOT}/index.html`],
    ['嵌套资源', `${APP_ORIGIN}/wa-sqlite/wa-sqlite.wasm`, `${ROOT}/wa-sqlite/wa-sqlite.wasm`],
    ['带哈希的产物文件名', `${APP_ORIGIN}/chunk-BYXBJQAS.js`, `${ROOT}/chunk-BYXBJQAS.js`],
    ['忽略查询串', `${APP_ORIGIN}/main.js?v=1`, `${ROOT}/main.js`],
    ['忽略 hash 路由', `${APP_ORIGIN}/index.html#/home`, `${ROOT}/index.html`],
    ['解码百分号转义', `${APP_ORIGIN}/a%20b.js`, `${ROOT}/a b.js`]
  ])('映射到根目录内的真实路径：%s', (_name, request, expected) => {
    expect(resolveAppAssetPath(request, ROOT)).toBe(expected);
  });

  // 这个 handler 会被喂进任何渲染进程发起的请求；放行目录外的路径
  // 等于把整个文件系统开成静态服务器。
  //
  // 边界要分清楚：WHATWG 的 URL 解析器把 `..` **和** `%2e%2e` 都当点段归一化掉
  //（`/%2e%2e/%2e%2e/x` 解析完就是 `/x`），所以这两种写法根本到不了越界那一步。
  // 真正能活着穿过解析器的是**编码的斜杠** `%2f` —— 它不是分隔符，pathname 原样保留，
  // 只有在 decodeURIComponent 之后才变回 `../`。因此前缀判定必须在解码**之后**，
  // 顺序反了这一条就漏。
  it.each([
    ['明文上跳被解析器归一化', `${APP_ORIGIN}/../../secrets.txt`, `${ROOT}/secrets.txt`],
    ['编码点段同样被归一化', `${APP_ORIGIN}/%2e%2e/%2e%2e/secrets.txt`, `${ROOT}/secrets.txt`]
  ])('解析器已归一化的上跳落在根目录内：%s', (_name, request, expected) => {
    expect(resolveAppAssetPath(request, ROOT)).toBe(expected);
  });

  it.each([
    ['编码斜杠拼出的上跳', `${APP_ORIGIN}/%2e%2e%2f%2e%2e%2fetc%2fpasswd`],
    ['编码斜杠上跳到同级目录', `${APP_ORIGIN}/%2e%2e%2fapp.asar`],
    ['NUL 截断', `${APP_ORIGIN}/index.html%00.png`]
  ])('拒绝逃出根目录的请求：%s', (_name, request) => {
    expect(resolveAppAssetPath(request, ROOT)).toBeNull();
  });

  it.each([
    ['file: 协议', 'file:///etc/passwd'],
    ['http: 协议', 'http://evil.example/index.html'],
    ['无法解析', 'not a url']
  ])('只处理本方案的请求：%s', (_name, request) => {
    expect(resolveAppAssetPath(request, ROOT)).toBeNull();
  });
});

describe('parseDevServerPort', () => {
  // ELEC-03：`parseInt('4120junk')` 静默得到 4120；`parseInt('')` 得到 NaN 并被拼进 loadURL
  it.each([
    ['尾部垃圾字符', '4120junk'],
    ['空串', ''],
    ['非数字', 'abc'],
    ['负数', '-1'],
    ['小数', '41.20'],
    ['超出范围', '65536'],
    ['零', '0'],
    ['undefined', undefined]
  ])('拒绝非法端口：%s', (_name, raw) => {
    expect(() => parseDevServerPort(raw)).toThrow(RangeError);
  });

  it.each([
    ['默认端口', '4120', 4120],
    ['下界', '1', 1],
    ['上界', '65535', 65535]
  ])('接受合法端口：%s', (_name, raw, expected) => {
    expect(parseDevServerPort(raw)).toBe(expected);
  });
});

describe('shouldHideWindow', () => {
  it('显式置 1 时隐藏窗口', () => {
    expect(shouldHideWindow({ [HIDE_WINDOW_ENV]: '1' })).toBe(true);
  });

  // 判定只认 `'1'`：这个开关唯一的调用方是 e2e 的 launchEnv()，
  // 多认几种写法只会让「设了但没生效」多几种排查方向。
  // 尤其是 `'0'` —— e2e 用它做「这次我要看着窗口跑」的逃生口，绝不能被当成真值。
  it.each([
    ['未设置', {}],
    ['空串', { [HIDE_WINDOW_ENV]: '' }],
    ['显式关闭', { [HIDE_WINDOW_ENV]: '0' }],
    ['其它写法一律不认', { [HIDE_WINDOW_ENV]: 'true' }]
  ])('其余取值照常显示窗口：%s', (_name, env) => {
    expect(shouldHideWindow(env)).toBe(false);
  });

  // 变量名是跨进程契约：主进程读它，e2e 的 packaged-app.ts 写它。
  // 改名不会让任何单测变红，只会让窗口重新弹出来 —— 所以在这里把字面量钉住。
  it('环境变量名保持不变', () => {
    expect(HIDE_WINDOW_ENV).toBe('DEV_RXDB_ELECTRON_HIDE_WINDOW');
  });
});

describe('resolveDevServerPort', () => {
  it('命令行参数优先于环境变量', () => {
    expect(resolveDevServerPort(['--port=5000'], { DEV_SERVER_PORT: '6000' })).toBe(5000);
  });

  it('无参数时回落到环境变量，再回落到默认值', () => {
    expect(resolveDevServerPort([], { DEV_SERVER_PORT: '6000' })).toBe(6000);
    expect(resolveDevServerPort([], {})).toBe(4120);
  });

  it('`--port=` 空值必须报错，而不是静默变成 NaN', () => {
    expect(() => resolveDevServerPort(['--port='], {})).toThrow(RangeError);
  });
});
