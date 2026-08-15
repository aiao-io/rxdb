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
- [x] Independent: 以 Chrome adapter 与 fake provider 验收，不等待 US-904a 或任何 native host
- [x] Negotiable: 内部状态服务拆分可调整，wire v2 和安全限额不可漂移
- [x] Valuable: Electron、Tauri 和 Chrome 只维护一套面板、状态机与协议
- [x] Estimable: 兼容窗口、provider 联合、授权、传输状态机、数值限额和快照终止条件已冻结
- [x] Small: 不接任何 Electron/Tauri native host，也不负责桌面窗口 bootstrap
- [x] Testable: conformance suite、浏览器回归、伪造授权、传输、1001 条分页和错误矩阵可自动验证
-->

# 用户故事：DevTools 共享 v2 协议与面板

> 共享范围与安全契约见 [US-904](./US-904-electron-native-storage-devtools.md)。本故事发布 wire v2、
> 一个 minor 的 v1/v2 迁移桥和平台无关 conformance suite，并把 Chrome 扩展中的 Angular 面板抽成内部库。

## 作为/我想要/以便

**作为** DevTools transport/provider 的实现者
**我想要** 使用一套有版本、身份、资源上限和能力描述的共享协议与面板
**以便** Chrome、Electron、Tauri 对相同数据和错误产生相同状态，不复制 UI 或猜测后端能力

## 启动门禁

- 无功能前置；可与 [US-904a](./US-904a-electron-mv3-devtools-feasibility.md) 并行。
- 不依赖 US-207、US-504、US-210 或 US-505；native 能力用共享 fake provider 验收。

## 范围边界

### In Scope

- 将面板、状态机和平台无关 transport token 抽到 generator 创建的内部 Nx library
  `packages/rxdb-devtools-panel/`，Chrome runtime 只作为 adapter 注入
- 发布 wire v2：外层版本范围协商，内层 exact-key 消息；connector/provider owner 在 HANDSHAKE
  签发 session，HANDSHAKE_ACK 只回显。保留至少一个 minor 的 v1/v2 迁移桥，bridge 不授予新能力
- 定义按 `database`、`files`、`settings` 组合的版本化 provider descriptors、语义 kind、操作集合、
  `runtime` 显示信息与资源上限；未知/缺失能力一律 unsupported，行为不得按 runtime 分支
- 冻结 operation 授权矩阵：connector 和 provider/host 双重校验 `DevToolsCapability` 与 descriptor；
  文件 mutation/清理还要求显式 `mutationPolicy: allow`，默认只读
- 冻结 `sessionId` / `requestId` / `transferId` 规则、并发/分块/分页/超时限额与稳定错误码
- 冻结文件传输 `START → CHUNK* → COMPLETE/CANCEL` 状态机、连续 offset、总字节校验与临时文件终态
- Database、Events、branch、Storage metadata 和文件页使用共享 provider fixture；事件集合只读取
  `RXDB_EVENT_TYPES`
- Storage 诊断在 storage 全局独占锁内物化 metadata 与 committed files 的 immutable snapshot，
  稳定排序并执行 100,000 条 / 32 MiB 上限；只有 `complete: true` 才显示结论
- 提供平台无关 provider/panel conformance suite；Chrome、Electron、Tauri 只实现薄 transport driver，
  不复制 fixture、状态机或错误断言
- 删除当前不安全的数据库下载路径：按钮禁用，命令返回 `export_unsupported`，执行路径零 OPFS 读取
- Chrome 的 Database、Events、OPFS、Storage 与 Settings 清理行为回归；除数据库下载和超过
  `maxTransferBytes` 的传输明确拒绝外，用户可见行为不变

### Out of Scope

- Electron/Tauri 窗口、host、SQLite 或原生文件系统接入
- 数据库导入导出、SQLite/WAL 热备份、export lease 或新的可靠备份实现
- 在 v1 bridge 上开放 provider descriptor、native files 或任何 v2 新操作；bridge 只保留既有能力
- 无限期维护 v1；至少一个 minor 的废弃窗口结束后按版本策略和扩展发布说明移除
- 将内部 Angular 面板发布为新的公共 npm 包

## v2 固定契约

### 版本与身份

- v2 connector 初始化时仍立即发送 v1-compatible HANDSHAKE，保证旧 panel 无等待可连接；新 panel
  初始化时先发送宽外层 `PROTOCOL_HELLO` 并把收到的 legacy HANDSHAKE 最多暂存 1 秒。v2 connector
  选择共同最高版本、生成 canonical UUID v4 `sessionId` 并发送 v2 HANDSHAKE，panel 只在
  HANDSHAKE_ACK 原样回显；1 秒内收到 v2 响应必须选择 v2，只有超时且已收到 legacy HANDSHAKE 才进入
  bridge。session 建立后拒绝同一连接上的迟到 handshake。旧 panel 的 v1 ACK/命令由新 connector 的
  v1 facade 承接。bridge 至少保留一个 minor，只暴露 v1 既有能力
- `sessionId` 是生命周期/关联标识，不是授权凭据；`requestId` / `transferId` 为 1～128 个 ASCII 字符，
  只允许 `[A-Za-z0-9._:-]`。同一 session 内 ID 终态后也不得复用。握手后全部消息绑定 session，
  请求/响应再绑定 request，传输帧再绑定 transfer

### Provider 与授权

| 领域       | kind                                      | 允许声明的操作                                                 |
| ---------- | ----------------------------------------- | -------------------------------------------------------------- |
| `database` | `rxdb` / `unavailable`                    | inspect、query、events、get/switch/create/delete branch        |
| `files`    | `opfs` / `native-files` / `unavailable`   | list、download、upload、create-directory、delete               |
| `settings` | `opfs` / `idb` / `sqlite` / `unavailable` | clear；database export 始终存在但固定返回 `export_unsupported` |

`runtime: browser | electron | tauri` 只用于显示名称，不参与操作判断。`unavailable` 的 operations 必须为空并
携带稳定 reason。相同 kind 在三个 runtime 上运行同一 conformance suite。

| 最低 capability | 操作                                                                        |
| --------------- | --------------------------------------------------------------------------- |
| `none`          | HANDSHAKE、PING、CLEAR、DISCONNECT 等连接生命周期                           |
| `readonly`      | inspect/query/events/get branches、Storage 诊断、文件 list/download         |
| `full`          | 既有 branch mutation；文件 upload/create-directory/delete 与 Settings clear |

文件 mutation 与 Settings clear 还必须由 provider 注册时显式设置 `mutationPolicy: allow`；省略即只读，不能因
`capabilities: full` 自动扩大。connector dispatch 前和 provider/host 执行前分别校验；capability 拒绝沿用
现有静默丢弃且 provider 调用次数为 0，未声明或未 opt-in 的操作返回 `provider_unsupported`。

### 资源、传输与快照

- 每 session 最多 32 个在途请求、2 个在途传输；非流式请求和传输空闲超时均为 15 秒。分页默认
  100 条、最大 500 条
- provider 必须声明 `maxTransferBytes`；browser OPFS 固定 50 MiB，panel 与 connector 执行双方较小值
- 传输固定为 `TRANSFER_START → TRANSFER_CHUNK* → TRANSFER_COMPLETE`，任一方可
  `TRANSFER_CANCEL`。START 声明 `totalBytes`；chunk 携带从 0 开始的 `chunkIndex` 与连续 `offset`，
  非空且最大 256 KiB。COMPLETE 只有在累计字节等于 `totalBytes` 时提交；零字节文件直接完成。
  取消、错误、超时或断连都丢弃临时文件，终态后的帧不得复活 transfer
- 诊断 snapshot 在 storage 全局独占锁内同时物化 metadata 和 committed logical files，按
  `(logicalPath, id)` 排序后释放锁。每 session 一个活动 snapshot，最多 100,000 条或 32 MiB
  规范化记录的 UTF-8 字节，capture 持锁总计不超过 15 秒；游标绑定 session/snapshot，60 秒无活动释放；
  panel 只在最后一页 `complete: true` 后展示结论
- 稳定错误码至少包含 `protocol_unsupported`、`provider_unsupported`、`invalid_identifier`、
  `request_limit_exceeded`、`transfer_limit_exceeded`、`payload_too_large`、`request_timeout`、
  `request_duplicate`、`transfer_duplicate`、`transfer_sequence_invalid`、`transfer_size_exceeded`、
  `transfer_incomplete`、`transfer_closed`、
  `snapshot_invalidated`、`snapshot_busy`、`snapshot_too_large` 与 `export_unsupported`

## 验收标准

| #   | 前置条件                                                     | 操作                                          | 预期结果                                                                                                           | 状态 |
| --- | ------------------------------------------------------------ | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ---- |
| 1   | 新 panel 连接 v1 connector                                   | 执行握手并使用既有页面                        | 暂存 legacy HANDSHAKE 最多 1 秒后进入 v1 bridge；既有页面保持可用，不展示 native/provider 新能力                   | ⬜   |
| 2   | v1 panel 连接 v2 connector                                   | 接收 eager legacy HANDSHAKE 并发送旧 ACK      | 无协商等待即可进入 v1 facade；既有命令保持行为，不建立 v2 session、不执行任何 v2/provider 新操作                   | ⬜   |
| 3   | 双方版本范围无交集                                           | 执行 `PROTOCOL_HELLO`                         | 返回 `protocol_unsupported` 与支持版本；不建立 session、不猜 provider                                              | ⬜   |
| 4   | v2 双方完成握手                                              | 发送非法/重复/复用/旧身份、错误回显或额外字段 | session 由 connector 签发；三类 ID 与 exact-key guard 生效，重复 ID 返回固定错误，旧 session 数据不进入当前状态    | ⬜   |
| 5   | 同源脚本持有合法 session，分别配置 none/readonly/full        | 伪造读写 provider operation                   | none 全拒；readonly 只放只读；full 仍不能绕过 descriptor 与 mutation opt-in；被拒操作的 provider/host 调用次数为 0 | ⬜   |
| 6   | fake providers 覆盖三个领域和全部 kind                       | 只改变 `runtime` 并运行 conformance           | 相同 kind 的状态和操作不变；IDB/unavailable 可表达；panel 不按 browser/electron/tauri 分支                         | ⬜   |
| 7   | session 达到 32 个请求、2 个传输或收到超大 chunk             | 再发请求、传输或大于 256 KiB 的 chunk         | 分别返回 `request_limit_exceeded`、`transfer_limit_exceeded`、`payload_too_large`，不分配资源                      | ⬜   |
| 8   | 传输包含零字节、正常多 chunk、乱序、重复、缺块、取消和迟到帧 | 执行完整 transfer 状态机                      | 正常/零字节内容一致；错误码分别稳定；仅校验通过的 COMPLETE 提交，其他终态无半写文件或孤儿 metadata                 | ⬜   |
| 9   | 请求/传输 15 秒无活动，或总量超过协商 `maxTransferBytes`     | 等待超时或发送越限 START                      | 分别返回 `request_timeout` / `transfer_size_exceeded` 并释放资源；缺失上限声明返回 `provider_unsupported`          | ⬜   |
| 10  | fixture 含 1001 条 metadata/files、两类缺失和内部临时状态    | 以默认页大小读取 snapshot                     | 独占锁内物化并稳定排序，不漏尾页；只在 complete 后报告；临时文件、journal、在途上传由 committed 枚举排除           | ⬜   |
| 11  | capture epoch 连续失效，或 snapshot 超过条目/字节上限        | 创建诊断 snapshot                             | 失效最多重试 3 次且总计不超过 15 秒，耗尽 `snapshot_busy`；超限立即 `snapshot_too_large`；都不保留旧结论或截断页   | ⬜   |
| 12  | Chrome Settings 展示数据库下载                               | 点击按钮并监控 OPFS 调用                      | 按钮禁用；强制命令返回 `export_unsupported`，`navigator.storage.getDirectory()` 与文件读取次数均为 0               | ⬜   |
| 13  | Chrome 与 fake native driver 运行同一 conformance suite      | 查询、事件、branch、文件、授权、传输和诊断    | 状态与错误完全一致；事件来自 `RXDB_EVENT_TYPES`；UI/状态服务不引用 Chrome runtime、PortService 或桌面全局对象      | ⬜   |
| 14  | session 有订阅、snapshot、请求和未完成传输                   | 关闭/刷新面板并建立新 session                 | 旧订阅、计时器、snapshot、请求、传输和临时文件全部释放；迟到响应、事件与帧被拒绝                                   | ⬜   |
| 15  | 普通 Chrome 页面使用现有 Web adapters                        | 运行 bridge、v2、面板与浏览器 smoke           | 新旧 connector 均可调试既有页面；可见收敛仅为数据库下载 unsupported 与超出声明总量的传输明确报错                   | ⬜   |
| 16  | 新 panel 同时收到 eager legacy 与 v2 HANDSHAKE               | 在 1 秒窗口内交换消息并注入迟到握手           | 确定选择共同最高版本且只建立一个 session；v2 胜出后不短暂进入 v1 状态，迟到握手不重置状态                          | ⬜   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

## 技术约束

- 外层只解析来源、方向、版本范围和 session 身份以便协商；选定版本后才进入具体 payload guard。
- session ID 不得被描述或实现为鉴权 secret；授权只来自应用配置的 capability、descriptor 与 mutation policy。
- provider descriptors 按领域和语义 kind 组合；不得增加平台专属 kind、`full` 聚合 kind 或默认能力 fallback。
- snapshot cursor 只对当前 session/snapshot 有效；物化记录不可变，重试产生新 snapshot，不接受旧页或旧 complete。
- v1 bridge 的删除必须晚于一个 minor 废弃窗口，并同步 `website/docs/migration/v1.md` 与扩展最低 connector 版本。
- transport、connector、provider 与 panel 分别执行身份、授权、限额和清理，不能只靠 UI 禁用。

## 实现文件

- `packages/rxdb-devtools/src/` — v1/v2 协商、provider descriptors、授权、传输、快照、错误和生命周期
- `packages/rxdb-devtools-panel/` — generator 创建的内部 Angular library、面板、状态机和 transport token
- `apps/rxdb-devtools-extension/src/` — Chrome adapter、迁移桥/v2 接线、浏览器回归和数据库下载禁用
- `packages/rxdb-devtools/src/testing/` — fake providers、transport driver contract 与共享 conformance suite
- `requirements/api-baseline/` — 只有新增公开入口时同步

## References

- [US-904 Electron 原生本地存储 DevTools 契约](./US-904-electron-native-storage-devtools.md)
- [US-904a Electron 43 MV3 可行性门禁](./US-904a-electron-mv3-devtools-feasibility.md)
- [US-902 DevTools 面板](./US-902-devtools-panel.md)
- [版本与 API 稳定性策略](../../versioning-policy.md)
