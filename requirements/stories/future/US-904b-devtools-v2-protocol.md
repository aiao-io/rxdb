---
id: US-904b
title: DevTools v2 协议：控制面、provider 数据面与 conformance
status: Done
priority: High
epic: epic-003-ui-developer-tools
created: 2026-08-15
updated: 2026-08-16
tags: [tooling, devtools, protocol, provider, security, transfer, snapshot, conformance]
---

<!--
INVEST 检查清单:
- [x] Independent: 只改共享 connector/provider，用 fake relay 与 fake providers 验收，不依赖 UI 或 native host
- [x] Negotiable: 内部 reducer、消息分派与 provider 拆分可调整，ACK 所有权、wire schema、限额与错误联合不可漂移
- [x] Valuable: 一次性关闭降级竞态、none 泄漏、无界 ID 墓碑、跨 transport 编码歧义与平台错误分叉
- [x] Estimable: 版本选择、session、授权、ID 预算、binary 编码、transfer/snapshot 状态机与错误映射均有固定状态机与数值上限
- [x] Small: 不抽 Angular 面板，不接真实 Chrome/Electron/Tauri surface，不实现数据库导出
- [x] Testable: fake 四段 relay + fake providers 可自动运行完整 conformance suite
-->

# 用户故事：DevTools v2 协议：控制面、provider 数据面与 conformance

> 跨故事契约见 [US-904](./US-904-devtools-native-storage-contract.md)。**本故事是 v2 全部数值、状态机
> 与错误联合的唯一真相源**；US-904c / US-904d / US-905 只引用，不重定义。真实 Chrome relay 由
> [US-904c](./US-904c-devtools-shared-panel-chrome-migration.md) 承接。

## 作为/我想要/以便

**作为** DevTools transport 与 provider 的实现者
**我想要** 使用确定的版本选择、session 身份、权限矩阵、有界请求生命周期、descriptor、binary wire、
资源限制、快照与错误映射
**以便** 新旧 panel/connector 组合不会竞态降级、低权限页面不会泄漏数据、长 session 不会无界增长，
且三运行时的文件与诊断行为能通过同一套断言，而不是被 transport 细节分叉

## 启动门禁

无协议前置。三个领域（`database` / `files` / `settings`）全部使用共享 fake provider 验收，
不等待 US-904a 或任何 native host。

## 范围边界

### In Scope

**控制面**

- v2 宽外层消息与 exact-key 内层 guard
- eager legacy HANDSHAKE、`PROTOCOL_HELLO`、v2 HANDSHAKE/ACK 和 v1 facade 的确定状态机
- panel/background/content/connector 四段 relay 的单一 ACK 所有权 contract fixture
- canonical UUID v4 `sessionId`，有界 `requestId` / `transferId` 生命周期和 session 轮换
- `none` / `readonly` / `full` 的授权矩阵、静默拒绝和零数据泄漏
- 控制面错误、超时、断连、迟到帧和资源清理 conformance

**provider 数据面**

- 三领域可辨识 provider descriptor、语义 kind、操作集合、runtime 显示信息和资源限制
- 文件 list/download/upload/create-directory/delete 的共享 request/response schema
- base64 binary wire、safe-integer guard、流式 transfer 状态机和内存/消息上限
- Storage metadata / committed files 的有界 immutable snapshot 与确定性字节计量
- 穷举 v2 provider error union、平台异常映射 contract 和完整 conformance suite

### Out of Scope

- Angular panel 抽取、Chrome runtime 接线或浏览器页面回归（US-904c）
- Electron / Tauri transport、窗口与 native host（US-904d / US-905）
- 数据库导入导出、SQLite/WAL 热备份和 export lease
- 原生文件布局、路径编码、原子写入和补偿算法；真实 provider 只能适配既有业务语义

---

## 第一部分：v2 控制面

### 版本选择与 ACK 所有权

- `PROTOCOL_HELLO` payload 精确为 `{ supportedVersions: number[] }`；数组非空、降序、去重，最多 8 项，
  每项是 1～255 的正 safe integer。connector 选择双方共同支持的最高版本
- v2 connector 初始化时立即发送**字节级兼容现有 v1 guard**的 legacy HANDSHAKE，旧 panel 可由旧
  background 立即 ACK，无协商等待进入 v1 facade
- v2 connector 收到 `PROTOCOL_HELLO` 后发送 payload 精确为 `{ protocolVersion: 2, sessionId, capabilities }`
  的 v2 HANDSHAKE。connector 在**每次**收到合法 HELLO 时都要响应，不能因为已经发过 eager legacy
  HANDSHAKE 就把后到的 HELLO 当重复消息丢弃
- v2 HANDSHAKE_ACK payload 精确为 `{ protocolVersion: 2, sessionId }`。只有 panel 可以生成 ACK；新
  background/content 只校验和转发，禁止看到 HANDSHAKE 就自行合成 ACK
- 双方没有共同版本时返回 `protocol_unsupported` 和本端 `supportedVersions`，不建立 session
- 同一 transport connection 最多建立一个 session。重复 ACK、错误回显或交叉握手在分配 provider
  资源前拒绝；无 session 时的重复 HELLO 按下方补发规则处理，不算非法帧

#### 补发与 1,000 ms 决策窗口

握手窗口**不以 panel 初始化为起点**。panel 打开时 inspected page 的 connector 可能尚未 bootstrap，
content script 也可能还没注入（注入要等 `chrome.permissions.request` 的用户授权，耗时无上界）。
以 init 起算的计时器会在任何一条握手到达之前就过期，让「双方都支持 v2」的组合稳定退回 v1。
因此固定为**证据触发**：

- panel 在两个时机发送 `PROTOCOL_HELLO`：① 自身初始化时；② **每次在无 session 状态下观察到 legacy
  HANDSHAKE 时立即补发一次**。补发与暂存在同一 tick 完成，保证「connector 已存活」这件事一被证实，
  对端就立刻收到一次 HELLO
- 1,000 ms 决策窗口从**首次暂存 legacy HANDSHAKE**的那一刻开始计时。窗口只启动一次，后续 legacy
  HANDSHAKE 只替换暂存内容、不延长窗口，避免高频重握手的 connector 把窗口无限拖住
- 窗口内收到合法 v2 HANDSHAKE 必须选择 v2 并取消计时器；窗口到期时若仍只有暂存的 legacy
  HANDSHAKE，由 panel 发送 legacy ACK 进入 v1 facade
- **无 session 时迟到的 legacy HANDSHAKE 不是非法帧**，一律走上述暂存 + 补发 HELLO 路径。只有在
  session 已建立后到达的握手才按迟到帧拒绝
- v2 胜出后不得短暂进入 v1 状态，任何迟到 legacy/v2 握手都不能重置状态
- v1 facade 一旦进入即为**终态，直到 transport 重连**：此后到达的 v2 HANDSHAKE 被拒绝，同时置一个
  panel 本地可见的降级标记（提示重连以升级），不得中途切换协议版本或并存两个状态机

窗口起点改为证据触发后，「connector 存活 → 收到补发 HELLO → 回 v2 HANDSHAKE」只需要一个 relay
往返，1,000 ms 对本地四段 relay 有充足余量；而注入与授权造成的任意长延迟不再计入窗口。

### 身份与有界 ID 生命周期

- `sessionId` 由 connector/provider owner 生成 canonical UUID v4；panel 只回显。session 关闭后永不复用
- connector 运行在被检查页面里，而扩展显式接受 `http:` 页面，`crypto.randomUUID()` 在非安全上下文
  （如 `http://192.168.1.10:4200` 这类局域网 dev server）是 `undefined`。实现必须用
  `crypto.getRandomValues()` 构造 v4（设置 version/variant 位），不得直接依赖 `randomUUID`，
  也不得回落到 `Math.random()`
- `requestId` / `transferId` 是 1～128 个 ASCII 字符，只允许 `[A-Za-z0-9._:-]`；非法值返回
  `invalid_identifier`
- 同一 session 最多 32 个在途 request、2 个在途 transfer、4,096 个终态 request ID 和 256 个终态
  transfer ID。终态 ID 在当前 session 内不得复用，分别返回 `request_duplicate` / `transfer_duplicate`
- 总 ID 预算耗尽返回 `session_budget_exhausted`，不再登记新操作。panel 等在途操作归零后执行
  DISCONNECT 并重新握手；断连会直接取消在途操作，不能边保留旧请求边偷换 session
- 实现只保存当前 session 的有限 tombstone；不得为「永不复用」建立跨 session 或无界历史集合
- 非流式 request 的端到端 deadline 为 15 秒，从通过 guard 开始计算；超时返回 `request_timeout`
- 流式 transfer 不适用端到端 15 秒（1 GiB 上限下必然误杀），改用两道独立时限：
  - **idle deadline 15 秒**：只有通过 guard 的 `TRANSFER_START` / `TRANSFER_CHUNK` /
    `TRANSFER_COMPLETE` 帧才刷新。被拒帧（非法 base64、乱序、越限等）一律不刷新
  - **总时长上限 10 分钟**：从 START 通过 guard 起算，覆盖整个 transfer。取该值是因为 1 GiB 上限下
    它等价于要求约 1.7 MiB/s 的最低吞吐，本地 IPC / Port 远高于此
  - 任一时限到期返回 `transfer_timeout`（属控制面错误，不进入 provider 错误联合），并按终态规则
    丢弃临时文件与资源

### 能力与数据泄漏边界

| 最低 capability | 允许的操作                                                                                 |
| --------------- | ------------------------------------------------------------------------------------------ |
| `none`          | HANDSHAKE、PING、`CLEAR_EVENT_BUFFER`、DISCONNECT                                          |
| `readonly`      | inspect/query/events/get branches；实体/事件/branch 读取、Storage 诊断、文件 list/download |
| `full`          | branch mutation、文件 upload/create-directory/delete 与 `settings.clear`                   |

- v2 不再使用含糊的 `CLEAR`：`CLEAR_EVENT_BUFFER` 只清本 session 的事件缓冲，不清数据库、Storage、
  OPFS 或文件；Settings 清理由 `settings.clear` 定义。v1 facade 可在边界内映射 legacy `CLEAR`
- `none` 不只是拒绝入站查询：connector 不创建 RxDB event subscription，不把事件写入 buffer，也不发送
  DB_INFO、EVENT、BRANCHES、实体、Storage、文件或错误中的业务数据
- `readonly` / `full` 只由 connector/provider owner 的本地可信配置决定；HANDSHAKE 和 descriptor 中的
  capability 是告知，不是权限输入。客户端回显或请求中的更高档位一律忽略
- capability 拒绝沿用静默丢弃，且 provider 调用、host 调用、订阅和资源分配次数均为 0
- descriptor 未声明或 mutation 未 opt-in 属于**已识别 provider 请求**，返回结构化 `provider_unsupported`，
  不能与 capability 拒绝混为一谈

### 控制面错误

`protocol_unsupported`、`invalid_message`、`invalid_identifier`、`session_invalid`、`session_closed`、
`session_budget_exhausted`、`request_limit_exceeded`、`transfer_limit_exceeded`、`request_timeout`、
`transfer_timeout`、`request_duplicate`、`transfer_duplicate`。错误 envelope 不包含原 payload、实体值、
路径、SQL、文件内容或平台异常文本。

---

## 第二部分：provider 数据面

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
- 文件 mutation 与 `settings.clear` 还要求 provider owner 从可信配置显式注册 `mutationPolicy: allow`；
  省略即只读。wire payload 中自称的 policy/capability 不参与授权
- connector dispatch 前校验，provider/host 执行前使用自身绑定的配置独立校验

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

- 并发数、总 ID 预算与两道时限见第一部分「身份与有界 ID 生命周期」
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

除控制面错误外，v2 对外只允许以下 provider 错误码：

`provider_unsupported`、`provider_unavailable`、`invalid_path`、`resource_not_found`、
`resource_conflict`、`permission_denied`、`storage_quota_exceeded`、`payload_too_large`、
`payload_encoding_invalid`、`transfer_sequence_invalid`、`transfer_size_exceeded`、
`transfer_incomplete`、`transfer_closed`、`snapshot_expired`、`snapshot_busy`、
`snapshot_too_large`、`export_unsupported`、`operation_failed`。

DOMException、Node/Rust 错误码和 host 私有错误必须映射到上述联合；无法安全归类时只用
`operation_failed`。对外错误可以带 `retryable: boolean` 和脱敏 message，不得带绝对路径、SQL/绑定值、
加密字段、文件内容、stack 或原始平台 code。新增错误必须先修改共享 union 和三 driver conformance，
transport 不得临时发明平台私有码。

---

## 验收标准

### 控制面（AC#1～#14）

| #   | 前置条件                                                              | 操作                                                       | 预期结果                                                                                                                               | 状态     |
| --- | --------------------------------------------------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| 1   | 新 panel + v2 connector，经 fake background/content                   | 同时投递 eager legacy 与 v2 HANDSHAKE                      | background/content 不代 ACK；决策窗口内 v2 胜出，只建立一个 UUID v4 session，从未进入 v1 状态                                          | ✅       |
| 2   | 新 panel 先启动，v2 connector 在其后 bootstrap；relay 就绪延迟 5 秒   | 投递 eager legacy HANDSHAKE（panel 的首个 HELLO 早已丢失） | panel 暂存时同 tick 补发 HELLO，connector 响应 v2 HANDSHAKE，最终仍选 v2；**不因 panel 先于 connector 存在而降级到 v1**                | ✅       |
| 3   | 新 panel + v1 connector，legacy HANDSHAKE 在 panel init 后 5 秒才到达 | 暂存 legacy HANDSHAKE 并等待                               | 1,000 ms 窗口从**首次暂存**起算（非 panel init）；到期后由 panel 发送 legacy ACK 进入 bridge；不展示任何 v2/provider 能力              | ✅       |
| 4   | 无 session 状态下 connector 高频重发 legacy HANDSHAKE                 | 在窗口内持续投递                                           | 窗口只启动一次且不被延长，暂存内容被替换；到期仍按最后一次暂存进入 v1 facade                                                           | ✅       |
| 5   | v1 panel + v2 connector                                               | 旧 background ACK eager legacy HANDSHAKE                   | 无协商等待进入 v1 facade；不建立 v2 session，不执行新操作                                                                              | ✅       |
| 6   | 双方版本无交集、HELLO 非降序/重复/超长或含非法数字                    | 执行协商                                                   | 合法无交集返回 `protocol_unsupported`；非法形状返回 `invalid_message`；都不建立 session                                                | ✅       |
| 7   | 已进入 v1 facade                                                      | 投递迟到的合法 v2 HANDSHAKE                                | facade 是终态：拒绝该握手、不切换版本、不并存第二个状态机；置 panel 本地可见降级标记，只有 transport 重连才重新协商                    | ✅       |
| 8   | v2 session 已建立                                                     | 注入错误 ACK、重复 HELLO、迟到握手、旧 session 和额外键    | exact-key 和状态机拒绝；当前 session、版本与 UI 状态不变。与 AC#2/#3 的「无 session 迟到 legacy 握手」路径区分，后者必须被接受进入暂存 | ✅       |
| 9   | capability 为 none，握手前后各产生事件                                | ACK、PING、查询并观察内部订阅和消息总线                    | 只返回生命周期消息；事件订阅、buffer、DB_INFO/EVENT/BRANCHES/provider 调用均为 0                                                       | ✅       |
| 10  | none/readonly/full 分别运行控制面矩阵                                 | 伪造查询、branch mutation 与更高 capability 回显           | none 零数据；readonly 只读；full 仅允许自身操作；wire 回显不能扩大本地配置                                                             | ✅       |
| 11  | session 达到 32 个请求或 2 个传输                                     | 再登记一个                                                 | 返回对应 limit 错误且不分配资源                                                                                                        | ✅       |
| 12  | 连续完成 4,096 请求或 256 个传输                                      | 再登记唯一 ID，并尝试复用旧 ID                             | 新登记返回 `session_budget_exhausted`，复用返回 duplicate；tombstone 数量不超过固定上限，轮换后旧 session 消息全部拒绝                 | ✅       |
| 13  | 请求进行中或已超时                                                    | 断连、重握手并投递迟到响应                                 | 计时器和资源释放；迟到数据不进入新状态，旧 session 不复活                                                                              | ⚠️ →904c |
| 14  | fake transfer 帧序列（不含真实 provider）                             | 分别制造 idle 静默、被拒帧刷新尝试和超长总时长             | 合法帧刷新 idle，被拒帧不刷新；idle 15 秒或总时长 10 分钟到期返回 `transfer_timeout`，临时资源释放且不复活                             | ✅       |

### provider 数据面（AC#15～#24）

| #   | 前置条件                                                              | 操作                                         | 预期结果                                                                                                                               | 状态         |
| --- | --------------------------------------------------------------------- | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| 15  | fake providers 覆盖三个领域和全部 kind                                | 只改变 runtime 并运行 descriptor conformance | 相同 kind 的操作、状态和错误不变；unknown/duplicate/missing descriptor 被 exact guard 拒绝                                             | ✅           |
| 16  | none/readonly/full 与 mutation allow/omit 全组合                      | 调用全部 provider operations                 | capability、descriptor、policy 三层矩阵成立；被拒调用为 0，wire 自称权限不能扩大可信配置                                               | ✅           |
| 17  | 数值字段含边界值、NaN、Infinity、小数、负数和溢出                     | 运行所有 request/descriptor guards           | 仅范围内 safe integer 通过；非法值在资源分配前统一 `invalid_message`                                                                   | ✅           |
| 18  | base64 含正常、边界 chunk、非法字符、非规范 padding/URL-safe          | 传过 fake JSON driver 并重新编码             | decoded bytes 一致；非法输入 `payload_encoding_invalid`，不写入、不刷新 timeout                                                        | ✅           |
| 19  | 零字节、正常多 chunk、乱序、重复、缺块、越限、取消、idle 超时和迟到帧 | 执行完整 transfer 状态机                     | 仅合法 COMPLETE 提交；被拒帧不刷新 idle，超时返回 `transfer_timeout`；错误码稳定，其他终态无半写文件、孤儿 metadata 或完整文件内存副本 | ⚠️ →904d/905 |
| 20  | provider 上限缺失、为 0、超过 1 GiB 或双方上限不同                    | 启动上传/下载                                | descriptor guard 或 min-limit 生效；超过协商总量 `transfer_size_exceeded`                                                              | ✅           |
| 21  | fixture 含 1001 条记录、两类缺失和内部临时状态                        | 以默认页大小读取 snapshot                    | 独占锁内物化、tuple 稳定排序和字节计量，不漏尾页；只在 complete 后报告，临时状态不误报                                                 | ⚠️ →904d/905 |
| 22  | 等锁、epoch 连续失效、条目/字节超限、60 秒过期                        | 创建并翻页                                   | 请求进入起 15 秒内结束；分别返回 busy/too_large/expired，取消能中止等待，不保留旧结论或截断页                                          | ✅           |
| 23  | OPFS/Node/Rust 代表性 not-found/conflict/permission/quota 错误        | 运行共享错误映射 contract                    | 三端映射为同一穷举错误码，响应不泄漏路径、stack、平台 code 或内容                                                                      | ⚠️ 部分      |
| 24  | database export 在任意 kind/runtime 下被强制调用                      | 监控 provider/filesystem                     | 固定 `export_unsupported`，provider、OPFS、SQLite、WAL 和应用目录读取次数均为 0                                                        | ⚠️ →904c     |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

### 保留项：fake 关不掉的 5 条

19 条 ✅ 全部有对应断言且在 `pnpm nx test rxdb-devtools` 中绿。下列 5 条**不写 ✅**——
fake 能证明的部分已证明，剩下的部分不是「还没写测试」，而是本包结构上不可测：

| AC  | 本轮 fake 验收到的程度                                                                                                                                                     | 谁最终关闭                                           |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| 13  | 计时器与资源释放、迟到响应不进新状态、旧 session 帧被拒，均已断言；但「断连」由 fake relay 自己定义。service worker 重启、Port 重连与页面刷新的真实语义不在本包            | US-904c AC#9                                         |
| 19  | 状态机全部终态、错误码稳定性、`peakRetainedBytes ≤ 256 KiB` 已断言；「不得整文件驻留内存」只有这一个代理指标，Rust / 主进程那一半在本包结构上不可观测                      | US-904d / US-905                                     |
| 21  | tuple 稳定排序、字节计量、不漏尾页、只在 complete 后报告已由 `provider/snapshot` 单测断言；fake 锁只能证明**调用顺序**，证明不了真实独占锁排斥并发写者                     | US-904d / US-905                                     |
| 23  | 三来源代表性 fixture 全部映射到同一联合且响应脱敏；穷尽性只做到「`DEVTOOLS_PROVIDER_ERROR_CODES` 每个成员都至少被一条 fixture 产出」的 meta-test，真实平台异常空间无法枚举 | 部分；US-904d / US-905 补 fixture **加行**而非加分支 |
| 24  | `export_unsupported` 固定返回、provider 与 host 读取计数为 0 已断言；但本包没有真实 OPFS/SQLite/WAL 代码路径，这是在数一个从未存在过的调用                                 | US-904c AC#13                                        |

## 实现文件

- `packages/rxdb-devtools/src/` — v2 envelope、协商、session、授权、ID 预算、错误和生命周期
- `packages/rxdb-devtools/src/provider/` — descriptor、授权、transfer、snapshot、错误和规范化 helper
- `packages/rxdb-devtools/src/testing/` — fake 四段 relay、fake providers、JSON driver 与完整 conformance suite
- `requirements/api-baseline/` — 若新增公开类型或入口则同步

## References

- [US-904 DevTools 原生本地存储调试共享契约](./US-904-devtools-native-storage-contract.md)
- [US-904c DevTools 共享面板与 Chrome v2 迁移](./US-904c-devtools-shared-panel-chrome-migration.md)
- [US-902 DevTools 面板](./US-902-devtools-panel.md)
- [版本与 API 稳定性策略](../../versioning-policy.md)
