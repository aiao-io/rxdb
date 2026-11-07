# @aiao/web-desktop-runtime

仓内维护的 Web 桌面运行内核，参考无界实现。代码、协议、构建和三框架适配由本仓控制，运行时不依赖 `wujie`、`wujie-react` 或 CDN 内核。当前包为 private，不发布 npm。

每个应用使用独立的原生 iframe 文档；Web Component 只承载窗口视口。应用必须接入协作 SDK，并在框架实际完成渲染后报告就绪。来源、上游许可、保留/删除清单和兼容边界见 [UPSTREAM.md](UPSTREAM.md)。

## 宿主

```ts
import { createWujie } from '@aiao/web-desktop-runtime';

const runtime = createWujie({
  allowedOrigins: ['https://apps.example.com'],
  onError: error => console.error(error),
});
const instance = runtime.createApp({
  appId: 'editor',
  instanceId: 'editor-window-1',
  version: '2026.11.1',
  url: 'https://apps.example.com/editor/',
  props: { theme: 'dark' },
});
instance.onRequest('file:read', async payload => readAuthorizedFile(payload));
await instance.mount(document.getElementById('window-content')!);
instance.hide();
instance.show();
await instance.request('document:save', { fileId: 'notes' }, { timeout: 5000 });
instance.destroy();
runtime.dispose();
```

`readAuthorizedFile` 为宿主提供的服务示意，必须自行做权限校验。默认只允许宿主同源；额外来源必须逐个声明，不支持通配符。入口只接受 HTTP(S)、拒绝 URL 凭据及保留参数 `__aiao_wujie`。跨源应用还需服务器允许对应宿主嵌入，浏览器 CSP/iframe 策略照常生效。

同一 instanceId 在一个 runtime 内不能重复登记，销毁和失败均释放身份。重复 mount 同容器复用同一 ready Promise，跨容器移动明确失败。hide/show 保留原 iframe；从文档移除外壳会自动销毁实例。createWujie 和模块导入支持 SSR，不注册全局监听。

状态：`created → loading → ready ↔ hidden`，失败进入 `failed`，显式释放进入 `destroyed`。ready 默认 15 秒超时，启动失败会拒绝 ready Promise 并调用 onError；运行中断通过状态订阅与 onError 通知。失败句柄不可复用，应重新 createApp；createWujie.dispose 后不可创建新实例。

## 子应用

```ts
import { connectWujieClient } from '@aiao/web-desktop-runtime/client';

const client = await connectWujieClient();
const app = await bootstrapFramework(client?.context.props);
client?.onDispose(() => app.unmount());
client?.onRequest('document:save', async payload => saveDocument(payload));
client?.onPropsChange(props => applyTheme(props['theme']));
client?.ready();
```

`bootstrapFramework` 等为业务函数示意。握手必须发生在业务入口/路由模块初始化之前；SDK 会移除内部 URL 参数，再恢复为应用真实地址。普通页面和未带运行标记的 iframe 立即返回 undefined，可继续独立启动。

SDK 信任嵌入它的父窗口，宿主负责应用来源准入；它不认证桌面运营者身份。初始化校验父窗口和随机令牌，后续只接收握手时转交的专属端口。协议只接受不超过 1 MiB、深度不超过 32 的 JSON 数据，不能传函数、DOM、Date 或循环引用。

`client.request` 和 `instance.request` 默认 5 秒超时，可传 AbortSignal；取消会通知对端中止处理信号。退出会拒绝在途请求，清除超时与监听，取消入站处理。处理函数需要响应 signal，自身副作用不会被自动撤销。

子应用 `bus.$emit` 只发给宿主，不隐式转给其他应用。宿主 `instance.emit` 定向发送，`runtime.bus.$emit` 显式广播给这个运行内核的已连接应用。旧的 `$wujie.props/bus` 与 `__WUJIE.id` 仅作为主题/路由协议的兼容入口。

## 三框架生命周期

| 入口 | API | 返回契约 |
| --- | --- | --- |
| `@aiao/web-desktop-runtime/angular` | `injectWujie(runtime, options)` | `WujieBinding` |
| `@aiao/web-desktop-runtime/react` | `useWujie(runtime, options)` | `WujieBinding` |
| `@aiao/web-desktop-runtime/vue` | `useWujie(runtime, options)` | `WujieBinding` |

三端均在容器连接文档后调用 `binding.mount(container)`；框架卸载时自动 `binding.unmount()`。binding 支持销毁后再次 mount，适配 React StrictMode。React options 使用稳定引用；Vue 在 setup/有效作用域中使用；Angular 在注入上下文中调用，可在 afterNextRender 装载。核心包不导入框架，各框架为可选 peer dependencies。

## 校验

```bash
NX_DAEMON=false NX_NO_CLOUD=true pnpm nx run-many -t build,typecheck,lint -p web-desktop-runtime --parallel=1
NX_DAEMON=false NX_NO_CLOUD=true pnpm nx test web-desktop-runtime --coverage
```

测试自动先构建三框架子应用，再通过真实 Chromium iframe 装载。首次需安装 Chromium：`pnpm exec playwright install chromium`。测试覆盖身份、协议来源校验、属性/事件/双向请求、取消、超时、错误、隐藏恢复、动态资源、框架卸载和 30 轮回收。测试页面和框架演示产物不进入内核 dist。

当前不包括 macOS/Windows 桌面外壳、应用目录、文件系统、托管存储、服务授权或离线缓存；本包是这些功能的运行基础。实机浏览器矩阵及最终产品验收另行记录。
