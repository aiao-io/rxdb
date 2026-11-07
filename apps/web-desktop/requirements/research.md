# Web Desktop 调研依据

读取日期：2026-11-07。外部参考用于提取任务和约束，不代表已对所有演示做交互试玩或性能验证。这里不记录市场优劣、未经验证的兼容性或精确工期。

## Web 桌面参考

用户提供的 [awesome-web-desktops](https://github.com/syxanash/awesome-web-desktops) 是桌面形式 Web 应用、作品和实验的集合。读取其 README 后，选出以下后续设计比较入口；本轮只确认其在清单中的来源链接，未逐一执行产品验收。

| 入口                                                       | 本产品要观察的问题                               | 责任故事                 |
| ---------------------------------------------------------- | ------------------------------------------------ | ------------------------ |
| [OS.js](https://github.com/os-js/OS.js)                    | 桌面如何组织应用、文件入口和持续任务             | DESKTOP-US-201、601      |
| [daedalOS](https://github.com/DustinBrett/daedalOS)        | 浏览器内窗口、任务入口与文件任务如何连成一个桌面 | DESKTOP-US-101～107、602 |
| [macOS in Svelte](https://github.com/puruvj/macos-web)     | 顶部菜单、Dock 与活动应用的交互语言              | DESKTOP-US-002           |
| [Win11React](https://github.com/blueedgetechno/win11React) | 开始菜单、任务栏与窗口分组的交互语言             | DESKTOP-US-003           |

参考清单不提供本产品的范围、授权或验收结论。本产品根据用户明确需求定义双交互、独立 Web 应用与仓内运行内核，不复制参考项目的商标、壁纸和专有资源。

## 无界：文档与源码实证

本轮临时读取 Tencent/wujie 的源码与文档，固定观察提交 `c45932998c0602f34454df8d3e29f4d33a38446a`。临时参考克隆不作为项目内化交付，仓内迁移由 DESKTOP-US-301 实施。

| 结论                                                                         | 可复验入口                                                                                                                                                                                                                                                                | 对用户故事的影响                                                       |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| 无界以 Web Components 和 iframe 组合承载应用，具有生命周期、保活及多应用能力 | [固定提交 README](https://github.com/Tencent/wujie/blob/c45932998c0602f34454df8d3e29f4d33a38446a/README.md)；[Wujie 类](https://github.com/Tencent/wujie/blob/c45932998c0602f34454df8d3e29f4d33a38446a/packages/wujie-core/src/sandbox.ts)                                | 基础思路复用，适配桌面身份与窗口生命周期；不预判上游没有相关能力       |
| 同源 iframe 可以通过 parent 与宿主直接通信                                   | [通信文档的 window 通信](https://github.com/Tencent/wujie/blob/c45932998c0602f34454df8d3e29f4d33a38446a/docs/guide/communication.md)；[iframeGenerator](https://github.com/Tencent/wujie/blob/c45932998c0602f34454df8d3e29f4d33a38446a/packages/wujie-core/src/iframe.ts) | 推断：不能将其作为恶意第三方代码的强安全边界；首版仅受信协作应用       |
| 保活会保留实例，被隐藏的应用仍可响应事件                                     | [运行模式的保活模式](https://github.com/Tencent/wujie/blob/c45932998c0602f34454df8d3e29f4d33a38446a/docs/guide/mode.md)                                                                                                                                                   | 最小化、关闭、退出、挂起必须分开定义；销毁后订阅需验证清理             |
| 上游路由同步使用应用名称关联宿主地址参数                                     | [路由同步](https://github.com/Tencent/wujie/blob/c45932998c0602f34454df8d3e29f4d33a38446a/docs/guide/sync.md)                                                                                                                                                             | 桌面采用实例身份区分多窗口路由；不把应用 ID 当唯一窗口 ID              |
| 预取与预执行不同，预执行可能占用宿主线程                                     | [预加载](https://github.com/Tencent/wujie/blob/c45932998c0602f34454df8d3e29f4d33a38446a/docs/guide/preload.md)                                                                                                                                                            | 默认只在空闲时预取静态资源，执行应用须服从启动与授权规则               |
| 上游有旧浏览器自动降级机制                                                   | [降级处理](https://github.com/Tencent/wujie/blob/c45932998c0602f34454df8d3e29f4d33a38446a/docs/guide/degrade.md)                                                                                                                                                          | 本产品先声明支持环境；不满足能力就明确失败，不继承无任务依据的兼容分支 |
| 资源跨源访问受服务端许可与浏览器限制                                         | [常见问题的资源请求错误](https://github.com/Tencent/wujie/blob/c45932998c0602f34454df8d3e29f4d33a38446a/docs/question/index.md)                                                                                                                                           | 应用发布配置需满足 CORS/CSP，桌面不提供绕过限制的代理承诺              |
| 上游包含 MIT 版权与第三方来源声明                                            | [固定提交 LICENSE](https://github.com/Tencent/wujie/blob/c45932998c0602f34454df8d3e29f4d33a38446a/LICENSE)                                                                                                                                                                | 引入源码及衍生产物保留相应声明和固定来源，不只有 npm 依赖              |

## 仓库现状实证

| 当前事实                                | 一次跳转复验入口                                                                                                                                                               | 需求边界                                                         |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| 已有内部路由、主题、Shadow DOM 样式协议 | [modules/orbit README](../../../modules/orbit/README.md)，[bindOrbitRoute](../../../modules/orbit/src/host-route.ts)、[getOrbitHost](../../../modules/orbit/src/host-theme.ts) | 作为迁移回归入口；运行内核另见 `packages/orbit`                  |
| 文档站初始使用上游 React 封装依赖       | [website/package.json](../../../website/package.json) 调研时的 wujie-react（现已迁移至 `@aiao/orbit`）                                                                         | 桌面产物不依赖上游运行时；迁移原消费方必须验证主题路由等用户行为 |
| 三个演示已使用内部协议                  | [Angular main](../../../apps/dev-rxdb-angular/src/main.ts)、[React main](../../../apps/dev-rxdb-react/src/main.tsx)、[Vue main](../../../apps/dev-rxdb-vue/src/main.ts)        | 用既有样例补充兼容验证，不把单个样例等同完整桌面接入             |
| 应用需求与平台需求独立编号和统计        | [应用级需求管理办法](../../../requirements/app-template/README.md)                                                                                                             | 本产品放 apps/web-desktop/requirements，使用 DESKTOP 前缀        |

## 仍须实施验证的结论

运行内核对动态导入、CSS/DOM 弹层、中文输入、真实 Safari、多实例存储和版本缓存的兼容性，需要用 DESKTOP-US-302～308 与 DESKTOP-US-701 的样例和实机结果判断。当前文档不能证明这些组合已可用。CPU 长任务隔离、任意第三方恶意代码和原生存储强隔离不在本模型的首版承诺中。
