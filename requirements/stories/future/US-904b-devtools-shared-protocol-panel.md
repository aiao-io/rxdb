---
id: US-904b
title: DevTools 共享 v2 协议与面板
status: Backlog
priority: High
epic: epic-003-ui-developer-tools
created: 2026-08-15
updated: 2026-08-15
tags: [tooling, devtools, protocol, angular, browser, provider]
---

<!--
INVEST 检查清单:
- [x] Independent: 以 Chrome adapter 与 fake provider 验收，不等待 US-207 / US-504 / US-210 / US-505
- [x] Negotiable: 内部状态服务拆分可调整，wire v2 和安全限额不可漂移
- [x] Valuable: Electron、Tauri 和 Chrome 只维护一套面板、状态机与协议
- [x] Estimable: v2 兼容矩阵、provider 联合、数值限额和分页终止条件已冻结
- [x] Small: 不接任何 Electron/Tauri native host，也不负责桌面窗口 bootstrap
- [x] Testable: 共享 fixture、浏览器回归、1001 条分页和错误矩阵可自动验证
-->

# 用户故事：DevTools 共享 v2 协议与面板

> 共享范围与安全契约见 [US-904](./US-904-electron-native-storage-devtools.md)。本故事发布 breaking
> wire v2，并把 Chrome 扩展中的 Angular 面板抽成平台无关内部库。

## 作为/我想要/以便

**作为** DevTools transport/provider 的实现者
**我想要** 使用一套有版本、身份、资源上限和能力描述的共享协议与面板
**以便** Chrome、Electron、Tauri 对相同数据和错误产生相同状态，不复制 UI 或猜测后端能力

## 启动门禁

- [US-904a](./US-904a-electron-mv3-devtools-feasibility.md) 必须完成且结论为 `supported`。
- 本故事不依赖 US-207、US-504、US-210 或 US-505；桌面能力用共享 fake provider 验收。

## 范围边界

### In Scope

- 将面板、状态机和平台无关 transport token 抽到 generator 创建的内部 Nx library
  `packages/rxdb-devtools-panel/`，Chrome runtime 只作为 adapter 注入
- 发布 breaking wire v2：外层版本协商，内层 exact-key 消息，HANDSHAKE_ACK 绑定 session；不保留
  v1 `payload: null` 运行兼容
- 定义按 `database`、`files`、`settings` 组合的版本化 provider descriptors、操作集合与
  `maxTransferBytes`；未知/缺失能力一律 unsupported
- 冻结 `sessionId` / `requestId` / `transferId` 规则、并发/分块/分页/超时限额与稳定错误码
- Database、Events、branch、Storage metadata 和文件页使用共享 provider fixture；事件集合只读取
  `RXDB_EVENT_TYPES`
- Storage 诊断消费分页快照，只有 `complete: true` 才显示结论；快照失效从头重试，最多 3 次且
  总计不超过 15 秒，耗尽返回 `snapshot_busy`
- 删除当前不安全的数据库下载路径：按钮禁用，命令返回 `export_unsupported`，执行路径零 OPFS 读取
- Chrome 的 Database、Events、OPFS、Storage 与 Settings 清理行为回归；除数据库下载安全收敛外
  用户可见行为不变

### Out of Scope

- Electron/Tauri 窗口、host、SQLite 或原生文件系统接入
- 数据库导入导出、SQLite/WAL 热备份、export lease 或新的可靠备份实现
- 对 v1 connector/panel 做双栈、自动降级或按缺失 descriptor 推断旧能力
- 将内部 Angular 面板发布为新的公共 npm 包

## v2 固定契约

- `sessionId`：canonical UUID v4；`requestId` / `transferId`：1～128 个 ASCII 字符且只允许
  `[A-Za-z0-9._:-]`
- 每 session 最多 32 个在途请求、2 个在途传输；单 chunk 最大 256 KiB
- 分页默认 100 条、最大 500 条；非流式请求和传输空闲超时均为 15 秒
- provider 必须声明 `maxTransferBytes`；browser OPFS 为 50 MiB，双方执行较小上限
- 稳定错误码至少包含 `protocol_unsupported`、`provider_unsupported`、`invalid_identifier`、
  `request_limit_exceeded`、`transfer_limit_exceeded`、`payload_too_large`、`request_timeout`、
  `snapshot_invalidated`、`snapshot_busy`、`export_unsupported`

## 验收标准

| #   | 前置条件                                                  | 操作                                              | 预期结果                                                                                                                                           | 状态 |
| --- | --------------------------------------------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 1   | 新 panel 连接 v1 connector                               | 执行握手                                          | 面板显示 `protocol_unsupported` 与支持版本，不建立 session、不猜 provider                                                                          | ⬜   |
| 2   | v1 panel 连接 v2 connector                               | 发送旧 ACK 或旧命令                               | connector 拒绝消息且不进入会话；不执行实体、文件或 Settings 操作                                                                                   | ⬜   |
| 3   | v2 双方完成握手                                          | 发送非法/重复/旧身份或额外字段                    | 三类 ID 与 exact-key guard 均生效，返回稳定错误；旧 session 数据不会进入当前状态                                                                    | ⬜   |
| 4   | session 已达到 32 个请求、2 个传输或收到超大 chunk       | 再发请求、传输或大于 256 KiB 的 chunk             | 分别返回 `request_limit_exceeded`、`transfer_limit_exceeded`、`payload_too_large`，未分配额外资源                                                   | ⬜   |
| 5   | 请求或传输 15 秒无活动，或 provider 限额低于 panel 声明 | 等待超时或发送越限数据                            | 返回 `request_timeout` 并释放资源；传输严格执行双方较小 `maxTransferBytes`，缺失声明返回 `provider_unsupported`                                    | ⬜   |
| 6   | fixture 含 1001 条 metadata/文件及两类真实缺失           | 以默认页大小读取完整诊断快照                      | 不漏尾页，只在 `complete: true` 后报告差异；临时文件、journal、在途上传不计入孤儿                                                                   | ⬜   |
| 7   | provider 连续使诊断快照失效                              | 面板自动重试                                      | 每次从头开始且不拼接快照；最多 3 次、总计不超过 15 秒，耗尽显示 `snapshot_busy` 并清除旧结论                                                       | ⬜   |
| 8   | Chrome Settings 展示数据库下载                           | 点击按钮并监控 OPFS 调用                          | 按钮禁用；强制发命令返回 `export_unsupported`，`navigator.storage.getDirectory()` 与文件读取调用次数均为 0                                         | ⬜   |
| 9   | Chrome 与 fake desktop provider 使用同一 fixture         | 查询实体、派发全部事件、切 branch、操作文件页     | 面板状态一致；事件类型完全来自 `RXDB_EVENT_TYPES`；UI/状态服务不直接引用 Chrome runtime、PortService 或桌面全局对象                                 | ⬜   |
| 10  | session 有订阅、请求和未完成传输                         | 关闭/刷新面板并建立新 session                     | 旧订阅、计时器、请求和传输全部释放；迟到响应、事件与 chunk 被拒绝                                                                                  | ⬜   |
| 11  | 普通 Chrome 页面使用现有各 Web adapter                   | 运行共享协议、面板测试和浏览器 smoke              | Database、Events、branch、OPFS、Storage 与 Settings 清理回归通过；唯一可见收敛是数据库下载变为明确 unsupported                                    | ⬜   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

## 技术约束

- 外层只解析来源、方向、版本和 session 身份以便返回版本错误；版本匹配后才进入具体 payload guard。
- provider descriptors 是可辨识联合，按领域组合；不得增加 `full`、平台名判断或默认能力 fallback。
- 分页 token 只对当前 snapshot/session 有效；重试产生新 snapshot，不接受旧页或旧 `complete`。
- transport、connector、provider 与 panel 分别在自己的信任边界执行身份、限额和清理，不能只靠 UI 禁用。

## 实现文件

- `packages/rxdb-devtools/src/` — v2 wire、provider descriptors、身份、限额、错误和生命周期
- `packages/rxdb-devtools-panel/` — generator 创建的内部 Angular library、面板、状态机和 transport token
- `apps/rxdb-devtools-extension/src/` — Chrome adapter、v2 接线、浏览器回归和数据库下载禁用
- `requirements/api-baseline/` — 只有新增公开入口时同步

## References

- [US-904 Electron 原生本地存储 DevTools 契约](./US-904-electron-native-storage-devtools.md)
- [US-904a Electron 43 MV3 可行性门禁](./US-904a-electron-mv3-devtools-feasibility.md)
- [US-902 DevTools 面板](./US-902-devtools-panel.md)
