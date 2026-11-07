# 来源与设计取舍

参考仓库：https://github.com/Tencent/wujie

固定参考提交：`c45932998c0602f34454df8d3e29f4d33a38446a`，读取日期：2026-11-07。

实际阅读的核心文件：`packages/wujie-core/src/index.ts`、`sandbox.ts`、`iframe.ts`、`shadow.ts`、`entry.ts`、`event.ts`、`effect.ts`、`tracker.ts`、`proxy.ts`、`sync.ts`。本包参考这些模块的职责与运行方式，重新实现桌面需要的子集，没有复制上游源码片段，也不包装上游 npm 包。第三方声明保留在 `third-party/wujie-LICENSE.txt`；本仓新代码使用 Aiao Team 的 MIT 许可。

## 保留与重构

| 上游设计/能力 | 本包实现 | 取舍理由 |
| --- | --- | --- |
| iframe JavaScript 运行环境 | 每实例独立的原生 iframe 文档 | DOM、CSS、全局变量、原生资源解析保持在同一文档，缩小需要维护的代理面 |
| Web Components 承载 | `aiao-wujie` + ShadowRoot + 可见 iframe | ShadowRoot 只负责宿主布局，应用样式不需要改写成 `:host` |
| 子应用 DOM 映射到宿主 | 不搬运、不代理 Document/Node | 弹窗和样式自然约束在应用视口内；跨窗口浮层应由桌面服务实现 |
| HTML 获取、脚本与 CSS 改写 | 使用浏览器原生文档加载 | 浏览器处理相对路径、模块、动态导入、CSP、资源请求和 HTTP 缓存；不实现隐式 CORS 绕过 |
| 全局 name、生命周期 | appId + instanceId + version，显式 ready | 多开身份与应用定义分离；load 不代表可交互；启动与销毁可观测 |
| 事件通信 | 来源验证握手 + 每实例 MessagePort | 宿主校验 source、精确 origin 和随机令牌；子应用校验父窗口和令牌；端口绑定后不再消费全局广播 |
| `$wujie.props/bus`、`__WUJIE.id` | SDK 提供最小兼容入口并在 dispose 恢复原描述符 | 保留仓库既有主题和路由协议，不承诺完整上游 API 兼容 |
| alive | hide/show 保留同一 iframe | 不移动 iframe，避免重新插入 DOM 引起重载；隐藏不等于暂停 |
| 历史兼容与自动降级 | 不提供 | 不支持的能力显式报错，不降为无隔离运行 |
| 预加载、资源缓存和多容器复用 | 不实现自定义资源缓存或预加载；使用浏览器 HTTP 缓存 | 版本资源完整性、离线能力和缓存淘汰属于后续产品工作，version 目前只是身份元数据 |

## 优化的证据边界

优化是架构和行为约束：减少 DOM 劫持、以专属端口收敛消息、超时与取消贯穿请求、同步清理监听/端口/iframe、同身份可安全重建、限制 JSON 深度和消息大小。测试证明这些行为，不代表相对上游的性能对比或实际内存采样。30 轮测试检查登记表与 DOM 回收，不等价于 heap 泄漏证明。

原生 iframe 会裁剪应用浮层；应用不能直接把菜单、拖拽或焦点逃逸到其他桌面窗口。完整导航会关闭当前连接并使实例失败，宿主应创建新实例；SPA 的 history/hash 导航保留当前文档。保持既有文档站路径和主题协议，删除消费方不再需要的 CSS selector 改写接线，保留 `modules/wujie` 的旧工具及其测试。

本包只接纳运营者批准的协作应用。同源 iframe 与 `allow-same-origin` 不能阻止恶意应用访问 parent 或同源存储；sandbox 不是产品权限系统，原生 localStorage/IndexedDB 不按 instanceId 自动分区，也不保证 CPU 死循环、浏览器崩溃或失去调度时的回收。应用服务授权、托管存储、桌面窗口系统和离线资源管理另行实现。
