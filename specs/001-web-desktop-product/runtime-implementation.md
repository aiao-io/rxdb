# Orbit：第一轮实现记录

日期：2026-11-07。范围来自用户追加要求：“先参考 wujie 代码，做一个自己的 wujie 并优化”。本轮实现运行基础，不把桌面外壳、文件系统和离线版本管理计为已交付。

## 设计与位置

主包：`@aiao/orbit`（`packages/orbit`），Nx 项目 `orbit`。核心与 client 不导入 UI 框架；Angular、React、Vue 为三个可选子路径，共用 `OrbitBinding`。代码参考固定无界提交 `c45932998c0602f34454df8d3e29f4d33a38446a` 后重写，采用原生 iframe 文档，不做跨文档 DOM 劫持。来源、MIT 与上游第三方声明、保留/删除能力及兼容结论见 [UPSTREAM.md](../../packages/orbit/UPSTREAM.md)。

- `runtime.ts`：来源准入、实例登记、显式就绪、失败/取消/销毁、隐藏恢复。
- `frame.ts`：Web Component 外壳、原生 iframe、文档断开回收。
- `client.ts`：子应用握手、专属端口、可见性/属性/销毁通知、Orbit 主题路由入口。
- `protocol.ts` / `payload.ts`：协议结构与 JSON 消息边界。
- `rpc.ts` / `bus.ts`：取消、超时、请求和事件清理，子应用事件不隐式转发给其他实例。
- `angular.ts` / `react.ts` / `vue.ts` / `binding.ts`：等价的容器绑定和框架释放。

实例身份是 appId + instanceId + version，其中 instanceId 在一个 runtime 内唯一；失败释放后可安全重建，旧句柄再次 destroy 不得删除新实例。version 为元数据，不宣称已完成版本资源固定。宿主握手检查 source、精确 origin、随机令牌，后续消息走专属 MessagePort。SDK 信任带运行标记的嵌入父窗口，不提供运营者身份认证。

## 消费迁移

`website/src/components/DemoMicroAppClient.tsx` 使用仓内 runtime，删除 `wujie-react` 依赖和不再需要的 Shadow CSS 改写接线，主题和路由协议迁移到 `modules/orbit`（包名 `@modules/orbit`，Nx 项目 `orbit-protocol`）。公开 API、全局上下文、握手标记与自定义元素均使用 Orbit 命名；Wujie 作为固定设计参考记录在 README、来源与许可证文件中。

Angular / React / Vue 演示和 benchmarks 的 main 先握手，再动态导入 bootstrap；独立打开时 SDK 返回 undefined。真实框架完成初始化后 ready，连接释放时卸载框架。三框架演示及 benchmarks 已通过生产构建和 Chromium 冒烟：初始主题、主题下发与回请、三端双向路由、销毁和独立打开正常。文档站接线测试通过；完整 Docusaurus 正式站点、Safari / Windows 实机和桌面外壳旅程仍待产品验收。

## 验证分层

运行内核通过 Nx 运行 Node 单元测试及真实 Chromium 集成测试。测试使用独立构建的静态 Web 应用，覆盖多实例、来源校验、相对资源/动态导入、显式 ready、属性、双向请求、超时、取消、启动中关闭、隐藏恢复、错误恢复及三框架生命周期。三框架各自真实渲染后报告 ready；React StrictMode 验证重复挂载释放。

30 轮回收检查 iframe DOM 与实例登记均归零；不等价于浏览器 heap 或性能基准验证。实际测试数量、覆盖率与命令最终结果记录于 [验收台账](../../apps/web-desktop/requirements/verification-report.md)。

## 未关闭范围

DESKTOP-US-301～306、308 保持 In Progress。第一轮之后，`apps/web-desktop` 已实现 macOS / Windows 交互外壳、托管文件与授权、完整版本资源缓存、预取和协作挂起；最新自动化范围与构建版本见分层验收台账。这些桌面能力由宿主管理，Orbit 核心的版本字段仍是运行元数据。桌面内三框架同任务六实例组合已有本机 Chromium 双交互模式证据，详见分层验收台账。完整文档站消费回归、其他未覆盖 AC、Safari/Edge/Windows 实机、输入法/读屏、性能及堆采样继续待验收。完整导航明确使连接失败，SPA history/hash 导航保留原文档；隐藏仅改变可见性，只有显式协作挂起才进入桌面挂起状态。

## 桌面三框架样例

`apps/web-desktop/src/samples` 提供三个实际框架渲染入口，共用 `FrameworkDocument`、现有 `EditorDocument` 和 `AppSession`。样例是目录中的可选应用，沿用版本资源、授权、实例路由、关闭协商和挂起协议，不修改 Orbit 公共能力入口。框架完成首次渲染才报告 ready，销毁统一释放事件、导航、服务处理器与框架挂载。

正式产物旅程已覆盖两种桌面风格的三端六实例：不同中文文档保存与下载、拒绝可选剪贴板后继续保存、独立路由与样式、20 次模式切换保持 iframe 与未保存内容、深色主题同步，以及取消和放弃退出。三端独立页面可编辑、撤销重做和下载，明确标出桌面能力不可用。该组合运行在同一 macOS Chromium 环境，不替代真实 Windows、Safari、输入法与读屏验收；既有文档站的完整正式消费回归继续保留。
