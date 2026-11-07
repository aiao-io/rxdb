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

DESKTOP-US-301～306、308 已进入实现，均保持 In Progress。尚无完整产品验收；预加载/挂起、托管存储与服务授权、离线资源完整性、macOS/Windows 外壳、Safari/Edge/Windows 实机矩阵、输入法/无障碍和性能/堆采样仍未完成。完整导航明确使连接失败，SPA history/hash 导航保留原文档。隐藏仅影响可见性，后台代码继续运行。
