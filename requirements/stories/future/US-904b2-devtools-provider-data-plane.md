---
id: US-904b2
title: DevTools provider 数据面与 conformance
status: Backlog
priority: High
epic: epic-003-ui-developer-tools
created: 2026-08-15
updated: 2026-08-15
tags: [tooling, devtools, provider, transfer, snapshot, conformance]
---

<!--
INVEST 检查清单:
- [x] Independent: 依赖 US-904b1 控制面，以 fake providers 验收，不依赖 UI 或 native host
- [x] Negotiable: provider 内部拆分可调整，descriptor、wire schema、限额和错误联合不可漂移
- [x] Valuable: 三运行时获得同一文件传输、诊断和失败语义
- [x] Estimable: binary 编码、数值 guard、transfer/snapshot 状态机和错误映射均已冻结
- [x] Small: 不抽面板、不接真实 Chrome/Electron/Tauri surface
- [x] Testable: fake provider 与薄 driver 可运行同一数据面 conformance suite
-->

# 用户故事：DevTools provider 数据面与 conformance

> 共享契约见 [US-904b](./US-904b-devtools-shared-protocol-panel.md)。本故事依赖
> [US-904b1](./US-904b1-devtools-v2-control-plane.md)，只交付平台无关 provider 数据面。

## 作为/我想要/以便

**作为** DevTools provider 的实现者
**我想要** 使用确定的 descriptor、binary wire、资源限制、快照和错误映射
**以便** Chrome、Electron、Tauri 的文件与诊断行为能通过同一套断言，而不是被 transport 细节分叉

## 启动门禁

- US-904b1 已冻结 v2 session、request/transfer ID、授权和控制面错误。
- 本故事不等待 US-904a 或任何 native host；`database` / `files` / `settings` 全部使用共享 fake provider。

## 范围边界

### In Scope

- 三领域可辨识 provider descriptor、语义 kind、操作集合、runtime 显示信息和资源限制
- 文件 list/download/upload/create-directory/delete 的共享 request/response schema
- base64 binary wire、safe-integer guard、流式 transfer 状态机和内存/消息上限
- Storage metadata/committed files 的有界 immutable snapshot 与确定性字节计量
- 穷举 v2 provider error union、平台异常映射 contract 和 data-plane conformance suite

### Out of Scope

- Chrome/Electron/Tauri 的真实 transport、host、窗口或 UI
- 数据库导入导出、SQLite/WAL 热备份和 export lease
- 原生文件布局、路径编码、原子写入和补偿算法；真实 provider 只能适配既有业务语义

## 固定 provider 契约

### Descriptor 与授权

每个 session 恰有一份 descriptor 集合；每个领域最多一个 descriptor，payload 使用 exact-key union：

| 领域       | kind                                      | 可声明操作                                              |
| ---------- | ----------------------------------------- | ------------------------------------------------------- |
| `database` | `rxdb` / `unavailable`                    | inspect、query、events、get/switch/create/delete branch |
| `files`    | `opfs` / `native-files` / `unavailable`   | list、download、upload、create-directory、delete        |
| `settings` | `opfs` / `idb` / `sqlite` / `unavailable` | clear；export 固定存在但只返回 `export_unsupported`     |

- descriptor 精确包含 `domain`、`version: 1`、`kind`、`operations`、`runtime`、`limits`；operations 去重并
  使用协议定义顺序。`unavailable` operations 必须为空并带共享 reason code
- `runtime: browser | electron | tauri` 只用于显示；相同 kind 在三个 runtime 上运行同一 conformance，
  不得按 URL、adapter 名、平台或缺失字段推断行为
- provider 必须声明 `maxTransferBytes`。它是 0～1 GiB 的非负 safe integer；files 声明 transfer 操作时
  必须大于 0。browser OPFS 固定 50 MiB，panel/connector/provider 使用各自上限的最小值
- `readonly` 允许实体/事件/branch 读取、Storage 诊断、文件 list/download；`full` 才允许 branch mutation、
  文件 upload/create-directory/delete 与 `settings.clear`
- 文件 mutation 与 `settings.clear` 还要求 provider owner 从可信配置显式注册
  `mutationPolicy: allow`；省略即只读。wire payload 中自称的 policy/capability 不参与授权
- connector dispatch 前校验，provider/host 执行前使用自身绑定的配置独立校验。未声明或未 opt-in 返回
  `provider_unsupported`；capability 拒绝继续遵循 US-904b1 的静默零调用语义

### 数值与 binary wire

- 所有协议数值必须通过统一 guard：`Number.isSafeInteger(value)`，并满足字段规定的非负/正数和上限；
  NaN、Infinity、`-1`、超过 `MAX_SAFE_INTEGER`、小数和数字字符串均返回 `invalid_message`
- `TRANSFER_CHUNK` 精确携带 `chunkIndex`、`offset`、`dataBase64`。`dataBase64` 使用 RFC 4648 standard
  alphabet、带规范 padding；解码后必须为 1～256 KiB。限制按**解码后字节数**计算，编码字符串长度
  只受 exact guard 推导，不作为文件大小
- 非规范 padding、URL-safe alphabet、非法字符、解码失败或重新编码不等于原文均返回
  `payload_encoding_invalid`，且不得重置 idle deadline 或分配/写入资源
- `totalBytes`、`offset`、`chunkIndex`、`pageSize`、`maxTransferBytes` 均为 safe integer；分页默认 100、
  最大 500，pageSize 必须为 1～500
- transport adapter 可以在自己的底层帧中编码字符串，但交给共享状态机的 v2 payload 必须保持上述形状；
  fake driver 不得用只有 structured clone 才能传递的 Uint8Array 偷换正式 wire

### Transfer 状态机

- 每 session 的并发、总 ID 预算，以及 transfer 的 **15 秒 idle deadline + 10 分钟总时长上限**均由
  US-904b1 冻结，本故事只引用、不重定义。两道时限到期一律返回 US-904b1 的 `transfer_timeout`
  （属控制面错误，不进入下方 provider 错误联合）
- idle deadline 只被通过 guard 的 `TRANSFER_START` / `TRANSFER_CHUNK` / `TRANSFER_COMPLETE` 刷新；
  被拒帧（`payload_encoding_invalid`、`transfer_sequence_invalid`、`transfer_size_exceeded` 等）不刷新
- 固定流程为 `TRANSFER_START → TRANSFER_CHUNK* → TRANSFER_COMPLETE`，任一方可发送
  `TRANSFER_CANCEL`。START 声明 `totalBytes`；超过协商上限返回 `transfer_size_exceeded`
- chunkIndex 从 0 连续递增，offset 从 0 开始且等于此前 decoded bytes 累计值。乱序、重复、不连续、
  空 chunk 或累计超过 totalBytes 返回 `transfer_sequence_invalid`
- COMPLETE 时累计字节必须等于 totalBytes，否则 `transfer_incomplete`。零字节文件只允许 START 后直接
  COMPLETE，不能发送空 CHUNK
- 只有 COMPLETE 全部校验通过才能提交临时文件。取消、超时、断连、错误和 session 轮换必须丢弃临时
  文件并释放资源；终态后的帧返回 `transfer_closed`，不能复活 transfer
- panel、connector、provider 和 host 逐块处理，不得把完整文件、完整 base64 或所有 chunk 同时缓存在
  renderer、extension service worker、WebView、Rust 或主进程内存

### Immutable snapshot

- provider 在 storage 全局独占锁内同时物化 metadata 与 committed logical files，按
  `(logicalPath, id)` 排序后释放锁；临时文件、rollback journal 和未完成 transfer 只能由 committed-file
  枚举排除，panel 不猜名称前缀
- 规范记录固定为 JSON tuple `[side, logicalPath, id, size, contentVersion]`；`side` 为 `meta | file`，
  不存在的标量写 `null`。容量是每条 tuple 执行 `TextEncoder(JSON.stringify(tuple)).byteLength` 后求和，
  不计 transport envelope，所有实现使用同一 helper
- 每 snapshot 最多 100,000 条或 32 MiB 规范记录；任何一项超过立即返回 `snapshot_too_large`，不截断
- 每 session 只允许一个活动 snapshot；cursor 绑定 session/snapshot/page offset，page offset 必须落在已物化
  边界。60 秒无活动释放，后续页返回 `snapshot_expired`
- snapshot 端到端 deadline 固定 15 秒，从 request 通过 guard 开始，覆盖等待全局锁、物化、最多 3 次
  epoch 重试和资源登记。deadline 或重试耗尽返回 `snapshot_busy`；取消/断连立即中止等待和枚举
- 锁所有权丢失或 capture epoch 改变返回内部 invalidated 信号并以新 snapshotId 从头重试；不得拼接两个
  时点的数据。只有最后一页 `complete: true` 后 panel 才能得出两类缺失结论

### 穷举 provider 错误联合

除 US-904b1 控制面错误外，v2 对外只允许以下 provider 错误码：

`provider_unsupported`、`provider_unavailable`、`invalid_path`、`resource_not_found`、
`resource_conflict`、`permission_denied`、`storage_quota_exceeded`、`payload_too_large`、
`payload_encoding_invalid`、`transfer_sequence_invalid`、`transfer_size_exceeded`、
`transfer_incomplete`、`transfer_closed`、`snapshot_expired`、`snapshot_busy`、
`snapshot_too_large`、`export_unsupported`、`operation_failed`。

DOMException、Node/Rust 错误码和 host 私有错误必须映射到上述联合；无法安全归类时只用
`operation_failed`。对外错误可以带 `retryable: boolean` 和脱敏 message，不得带绝对路径、SQL/绑定值、
加密字段、文件内容、stack 或原始平台 code。新增错误必须先修改共享 union 和三 driver conformance，
transport 不得临时发明平台私有码。

## 验收标准

| #   | 前置条件                                                       | 操作                                         | 预期结果                                                                                      | 状态 |
| --- | -------------------------------------------------------------- | -------------------------------------------- | --------------------------------------------------------------------------------------------- | ---- |
| 1   | fake providers 覆盖三个领域和全部 kind                         | 只改变 runtime 并运行 descriptor conformance | 相同 kind 的操作、状态和错误不变；unknown/duplicate/missing descriptor 被 exact guard 拒绝    | ⬜   |
| 2   | none/readonly/full 与 mutation allow/omit 全组合               | 调用全部 provider operations                 | capability、descriptor、policy 三层矩阵成立；被拒调用为 0，wire 自称权限不能扩大可信配置      | ⬜   |
| 3   | 数值字段含边界值、NaN、Infinity、小数、负数和溢出              | 运行所有 request/descriptor guards           | 仅范围内 safe integer 通过；非法值在资源分配前统一 `invalid_message`                          | ⬜   |
| 4   | base64 含正常、边界 chunk、非法字符、非规范 padding/URL-safe   | 传过 fake JSON driver 并重新编码             | decoded bytes 一致；非法输入 `payload_encoding_invalid`，不写入、不刷新 timeout               | ⬜   |
| 5   | 零字节、正常多 chunk、乱序、重复、缺块、越限、取消、idle 超时和迟到帧 | 执行完整 transfer 状态机                     | 仅合法 COMPLETE 提交；被拒帧不刷新 idle，超时返回 US-904b1 的 `transfer_timeout`；错误码稳定，其他终态无半写文件、孤儿 metadata 或完整文件内存副本 | ⬜   |
| 6   | provider 上限缺失、为 0、超过 1 GiB 或双方上限不同             | 启动上传/下载                                | descriptor guard 或 min-limit 生效；超过协商总量 `transfer_size_exceeded`                     | ⬜   |
| 7   | fixture 含 1001 条记录、两类缺失和内部临时状态                 | 以默认页大小读取 snapshot                    | 独占锁内物化、tuple 稳定排序和字节计量，不漏尾页；只在 complete 后报告，临时状态不误报        | ⬜   |
| 8   | 等锁、epoch 连续失效、条目/字节超限、60 秒过期                 | 创建并翻页                                   | 请求进入起 15 秒内结束；分别返回 busy/too_large/expired，取消能中止等待，不保留旧结论或截断页 | ⬜   |
| 9   | OPFS/Node/Rust 代表性 not-found/conflict/permission/quota 错误 | 运行共享错误映射 contract                    | 三端映射为同一穷举错误码，响应不泄漏路径、stack、平台 code 或内容                             | ⬜   |
| 10  | database export 在任意 kind/runtime 下被强制调用               | 监控 provider/filesystem                     | 固定 `export_unsupported`，provider、OPFS、SQLite、WAL 和应用目录读取次数均为 0               | ⬜   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

## 实现文件

- `packages/rxdb-devtools/src/provider/` — descriptor、授权、transfer、snapshot、错误和规范化 helper
- `packages/rxdb-devtools/src/testing/` — fake providers、JSON driver 与 data-plane conformance suite
- `requirements/api-baseline/` — 若 provider 类型新增公开入口则同步

## References

- [US-904b 共享 v2 协议与面板契约](./US-904b-devtools-shared-protocol-panel.md)
- [US-904b1 v2 控制面与安全边界](./US-904b1-devtools-v2-control-plane.md)
- [US-904b3 共享面板 library 抽取](./US-904b3-devtools-shared-panel-library.md)
- [US-904b4 Chrome v2 迁移](./US-904b4-devtools-chrome-v2-migration.md)
