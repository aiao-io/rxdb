# @aiao/orbit

Orbit 是仓内独立维护的 Web 应用隔离运行内核。名称取自“轨道”：桌面承载多个独立运行的应用。代码、协议、构建和 Angular / React / Vue 适配均由本仓维护，当前包为 private。

设计灵感与起始基线来自 [Wujie](https://github.com/Tencent/wujie)，固定参考提交为 `c45932998c0602f34454df8d3e29f4d33a38446a`。本实现按桌面需求重构职责与协议，不依赖上游 npm 包，也不承诺上游 API 兼容；后续以 Orbit 的契约独立演进。

每个应用使用独立的原生 iframe 文档；Web Component 只承载窗口视口。应用必须接入协作 SDK，并在框架实际完成渲染后报告就绪。来源、上游许可、保留/删除清单和兼容边界见 [UPSTREAM.md](UPSTREAM.md)。

## 宿主

```ts
import { createOrbit } from '@aiao/orbit';

const runtime = createOrbit({
  allowedOrigins: ['https://apps.example.com'],
  onError: error => console.error(error)
});
const instance = runtime.createApp({
  appId: 'editor',
  instanceId: 'editor-window-1',
  version: '2026.11.1',
  url: 'https://apps.example.com/editor/',
  props: { theme: 'dark' }
});
instance.onRequest('file:read', async payload => readAuthorizedFile(payload));
await instance.mount(document.getElementById('window-content')!);
instance.hide();
instance.show();
instance.focus();
await instance.request('document:save', { fileId: 'notes' }, { timeout: 5000 });
instance.destroy();
runtime.dispose();
```

`readAuthorizedFile` 为宿主提供的服务示意，必须自行做权限校验。默认只允许宿主同源；额外来源必须逐个声明，不支持通配符。入口只接受 HTTP(S)、拒绝 URL 凭据及保留参数 `__aiao_orbit`。跨源应用还需服务器允许对应宿主嵌入，浏览器 CSP/iframe 策略照常生效。

同一 instanceId 在一个 runtime 内不能重复登记，销毁和失败均释放身份。重复 mount 同容器复用同一 ready Promise，跨容器移动明确失败。hide/show 保留原 iframe；从文档移除外壳会自动销毁实例。focus 把键盘焦点交给应用文档（宿主无法感知焦点在两个跨源 iframe 之间移动，激活窗口时由宿主显式调用），只在显示中的就绪状态可用。createOrbit 和模块导入支持 SSR，不注册全局监听。

状态：`created → loading → ready ↔ hidden`，失败进入 `failed`，显式释放进入 `destroyed`。ready 默认 15 秒超时；iframe 文档加载后 3 秒内仍未握手（入口不可达、被浏览器拦截或未接入 SDK，浏览器只给 iframe 报 load，不报 error）即以 LOAD_ERROR 失败，不必等满就绪时限。启动失败会拒绝 ready Promise 并调用 onError；运行中断通过状态订阅与 onError 通知。失败句柄不可复用，应重新 createApp；createOrbit.dispose 后不可创建新实例。

## 子应用

```ts
import { connectOrbitClient } from '@aiao/orbit/client';

const client = await connectOrbitClient();
const app = await bootstrapFramework(client?.context.props);
client?.onDispose(() => app.unmount());
client?.onRequest('document:save', async payload => saveDocument(payload));
client?.onPropsChange(props => applyTheme(props['theme']));
client?.ready();
```

`bootstrapFramework` 等为业务函数示意。握手必须发生在业务入口/路由模块初始化之前；SDK 会移除内部 URL 参数，再恢复为应用真实地址。普通页面和未带运行标记的 iframe 立即返回 undefined，可继续独立启动。

SDK 信任嵌入它的父窗口，宿主负责应用来源准入；它不认证桌面运营者身份。初始化校验父窗口和随机令牌，后续只接收握手时转交的专属端口。协议只接受不超过 1 MiB、深度不超过 32 的 JSON 数据，不能传函数、DOM、Date 或循环引用。

`client.request` 和 `instance.request` 默认 5 秒超时，可传 AbortSignal；取消会通知对端中止处理信号。退出会拒绝在途请求，清除超时与监听，取消入站处理。处理函数需要响应 signal，自身副作用不会被自动撤销。

子应用 `bus.$emit` 只发给宿主，不隐式转给其他应用。宿主 `instance.emit` 定向发送，`runtime.bus.$emit` 显式广播给这个运行内核的已连接应用。`$orbit.props/bus` 与 `__ORBIT.id` 为仓内主题和路由协议提供上下文入口。

## 窗口接口

`@aiao/orbit/window` 是给桌面类宿主用的窗口协议，接口对齐 Tauri：宿主用 `windowProps(state)` 把窗口初始状态放进启动属性、用 `serveWindow(instance, host)` 登记窗口操作，状态变化后调用返回值的 `publish()`；应用用 `getCurrentWindow(client)` 拿到当前窗口（宿主没给窗口时为 undefined，相当于 Tauri 的 `isTauri()` 为假）。

```ts
import { getCurrentWindow } from '@aiao/orbit/window';

const appWindow = getCurrentWindow(client);
appWindow?.state; // { platform: 'macos', frame: 'standard' | 'transparent', decorations, focused, maximized }
appWindow?.onStateChange(state => render(state));
await appWindow?.minimize(); // 另有 toggleMaximize()、close()、setTitle(title)、setDecorations(visible)
const stop = appWindow?.trackDragRegions(document); // 对应 data-tauri-drag-region
```

`frame: 'transparent'` 的窗口可以 `setDecorations(false)`，让宿主收起自己的标题栏，由应用画标题栏与窗口按钮（对应 Tauri 的 `decorations: false`）；标准窗口调用会被宿主拒绝。拖动区不转发指针（跨源 iframe 按下后指针归 iframe）：带 `data-orbit-drag-region` 的元素减去其中的按钮、链接、输入框与 `data-orbit-no-drag` 元素，作为形状上报给宿主，宿主在 iframe 上方盖拖动层。请求与事件都走实例专属端口，应用只能操作自己的窗口。

## 三框架生命周期

| 入口                  | API                             | 返回契约       |
| --------------------- | ------------------------------- | -------------- |
| `@aiao/orbit/angular` | `injectOrbit(runtime, options)` | `OrbitBinding` |
| `@aiao/orbit/react`   | `useOrbit(runtime, options)`    | `OrbitBinding` |
| `@aiao/orbit/vue`     | `useOrbit(runtime, options)`    | `OrbitBinding` |

三端均在容器连接文档后调用 `binding.mount(container)`；框架卸载时自动 `binding.unmount()`。binding 支持销毁后再次 mount，适配 React StrictMode。React options 使用稳定引用；Vue 在 setup/有效作用域中使用；Angular 在注入上下文中调用，可在 afterNextRender 装载。核心包不导入框架，各框架为可选 peer dependencies。

## 校验

```bash
NX_DAEMON=false NX_NO_CLOUD=true pnpm nx run-many -t build,typecheck,lint -p orbit --parallel=1
NX_DAEMON=false NX_NO_CLOUD=true pnpm nx test orbit --coverage
```

测试自动先构建三框架子应用，再通过真实 Chromium iframe 装载。首次需安装 Chromium：`pnpm exec playwright install chromium`。测试覆盖身份、协议来源校验、属性/事件/双向请求、取消、超时、错误、隐藏恢复、动态资源、框架卸载和 30 轮回收。测试页面和框架演示产物不进入内核 dist。

当前不包括 macOS/Windows 桌面外壳、应用目录、文件系统、托管存储、服务授权或离线缓存；本包是这些功能的运行基础。实机浏览器矩阵及最终产品验收另行记录。
