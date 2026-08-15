---
id: US-904b1
title: DevTools v2 控制面与安全边界
status: Backlog
priority: High
epic: epic-003-ui-developer-tools
created: 2026-08-15
updated: 2026-08-15
tags: [tooling, devtools, protocol, security, conformance]
---

<!--
INVEST 检查清单:
- [x] Independent: 只改共享 connector/control driver，用 fake relay 验收，不依赖 UI 或 native host
- [x] Negotiable: 内部 reducer 与消息分派组织可调整，ACK 所有权和安全边界不可漂移
- [x] Valuable: 先关闭降级竞态、none 泄漏和无界 ID 墓碑三类控制面风险
- [x] Estimable: 版本选择、session、授权、ID 预算和错误均有固定状态机与数值上限
- [x] Small: 不定义 provider 数据面，不抽 Angular 面板，不接 Chrome/Tauri/Electron 真实 surface
- [x] Testable: fake 四段 relay、权限矩阵、竞态和资源预算可自动验收
-->

# 用户故事：DevTools v2 控制面与安全边界

> 共享契约见 [US-904b](./US-904b-devtools-shared-protocol-panel.md)。本故事只冻结 v2 控制面；
> provider、transfer 与 snapshot 由 US-904b2 承接，真实 Chrome relay 由 US-904b3 承接。

## 作为/我想要/以便

**作为** DevTools transport 的实现者
**我想要** 使用确定的版本选择、session 身份、权限矩阵和有界请求生命周期
**以便** 新旧 panel/connector 组合不会竞态降级，低权限页面不会泄漏数据，长 session 不会无界增长

## 范围边界

### In Scope

- v2 宽外层消息与 exact-key 内层 guard
- eager legacy HANDSHAKE、`PROTOCOL_HELLO`、v2 HANDSHAKE/ACK 和 v1 facade 的确定状态机
- panel/background/content/connector 四段 relay 的单一 ACK 所有权 contract fixture
- canonical UUID v4 `sessionId`，有界 `requestId` / `transferId` 生命周期和 session 轮换
- `none` / `readonly` / `full` 的控制面授权、静默拒绝和零数据泄漏
- 控制面错误、超时、断连、迟到帧和资源清理 conformance

### Out of Scope

- provider descriptor、文件操作、binary transfer 的编码与顺序状态机、snapshot 和业务错误映射
  （transfer 的时限、并发与 ID 预算仍由本故事冻结，US-904b2 只引用）
- Angular panel 抽取、Chrome runtime 接线或浏览器页面回归
- Electron/Tauri transport 与 native host

## v2 固定控制面

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
  session 已建立后到达的握手才按迟到帧拒绝（见下方状态终态规则）
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
- 实现只保存当前 session 的有限 tombstone；不得为“永不复用”建立跨 session 或无界历史集合
- 非流式 request 的端到端 deadline 为 15 秒，从通过 guard 开始计算；超时返回 `request_timeout`
- 流式 transfer 不适用端到端 15 秒（1 GiB 上限下必然误杀），改用两道独立时限，两者都由本故事冻结，
  US-904b2 只引用不重定义：
  - **idle deadline 15 秒**：只有通过 guard 的 `TRANSFER_START` / `TRANSFER_CHUNK` /
    `TRANSFER_COMPLETE` 帧才刷新。被拒帧（非法 base64、乱序、越限等）一律不刷新
  - **总时长上限 10 分钟**：从 START 通过 guard 起算，覆盖整个 transfer。取该值是因为 1 GiB 上限下
    它等价于要求约 1.7 MiB/s 的最低吞吐，本地 IPC / Port 远高于此
  - 任一时限到期返回 `transfer_timeout`，并按终态规则丢弃临时文件与资源

### 能力与数据泄漏边界

| 最低 capability | 控制面操作                                                         |
| --------------- | ------------------------------------------------------------------ |
| `none`          | HANDSHAKE、PING、`CLEAR_EVENT_BUFFER`、DISCONNECT                  |
| `readonly`      | inspect/query/events/get branches 及 US-904b2 的只读 provider 操作 |
| `full`          | 既有 branch mutation 及 US-904b2 显式允许的 mutation               |

- v2 不再使用含糊的 `CLEAR`：`CLEAR_EVENT_BUFFER` 只清本 session 的事件缓冲，不清数据库、Storage、
  OPFS 或文件；Settings 清理由 US-904b2 的 `settings.clear` 定义。v1 facade 可在边界内映射 legacy `CLEAR`
- `none` 不只是拒绝入站查询：connector 不创建 RxDB event subscription，不把事件写入 buffer，也不发送
  DB_INFO、EVENT、BRANCHES、实体、Storage、文件或错误中的业务数据
- `readonly` / `full` 只由 connector/provider owner 的本地可信配置决定；HANDSHAKE 和 descriptor 中的
  capability 是告知，不是权限输入。客户端回显或请求中的更高档位一律忽略
- capability 拒绝沿用静默丢弃，且 provider 调用、host 调用、订阅和资源分配次数均为 0
- descriptor 未声明或 mutation 未 opt-in 属于已识别 provider 请求，US-904b2 返回结构化错误，不能与
  capability 拒绝混为一谈

### 控制面错误

本故事冻结：`protocol_unsupported`、`invalid_message`、`invalid_identifier`、`session_invalid`、
`session_closed`、`session_budget_exhausted`、`request_limit_exceeded`、`transfer_limit_exceeded`、
`request_timeout`、`transfer_timeout`、`request_duplicate`、`transfer_duplicate`。错误 envelope 不包含
原 payload、实体值、路径、SQL、文件内容或平台异常文本。

## 验收标准

| #   | 前置条件                                                        | 操作                                                    | 预期结果                                                                                                                                    | 状态 |
| --- | --------------------------------------------------------------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 1   | 新 panel + v2 connector，经 fake background/content             | 同时投递 eager legacy 与 v2 HANDSHAKE                   | background/content 不代 ACK；决策窗口内 v2 胜出，只建立一个 UUID v4 session，从未进入 v1 状态                                               | ⬜   |
| 2   | 新 panel 先启动，v2 connector 在其后 bootstrap；relay 就绪延迟 5 秒 | 投递 eager legacy HANDSHAKE（panel 的首个 HELLO 早已丢失） | panel 暂存时同 tick 补发 HELLO，connector 响应 v2 HANDSHAKE，最终仍选 v2；**不因 panel 先于 connector 存在而降级到 v1**                     | ⬜   |
| 3   | 新 panel + v1 connector，legacy HANDSHAKE 在 panel init 后 5 秒才到达 | 暂存 legacy HANDSHAKE 并等待                            | 1,000 ms 窗口从**首次暂存**起算（非 panel init）；到期后由 panel 发送 legacy ACK 进入 bridge；不展示任何 v2/provider 能力                   | ⬜   |
| 4   | 无 session 状态下 connector 高频重发 legacy HANDSHAKE           | 在窗口内持续投递                                        | 窗口只启动一次且不被延长，暂存内容被替换；到期仍按最后一次暂存进入 v1 facade                                                                | ⬜   |
| 5   | v1 panel + v2 connector                                         | 旧 background ACK eager legacy HANDSHAKE                | 无协商等待进入 v1 facade；不建立 v2 session，不执行新操作                                                                                   | ⬜   |
| 6   | 双方版本无交集、HELLO 非降序/重复/超长或含非法数字              | 执行协商                                                | 合法无交集返回 `protocol_unsupported`；非法形状返回 `invalid_message`；都不建立 session                                                     | ⬜   |
| 7   | 已进入 v1 facade                                                | 投递迟到的合法 v2 HANDSHAKE                             | facade 是终态：拒绝该握手、不切换版本、不并存第二个状态机；置 panel 本地可见降级标记，只有 transport 重连才重新协商                         | ⬜   |
| 8   | v2 session 已建立                                               | 注入错误 ACK、重复 HELLO、迟到握手、旧 session 和额外键 | exact-key 和状态机拒绝；当前 session、版本与 UI 状态不变。与 AC#2/#3 的「无 session 迟到 legacy 握手」路径区分，后者必须被接受进入暂存      | ⬜   |
| 9   | capability 为 none，握手前后各产生事件                          | ACK、PING、查询并观察内部订阅和消息总线                 | 只返回生命周期消息；事件订阅、buffer、DB_INFO/EVENT/BRANCHES/provider 调用均为 0                                                            | ⬜   |
| 10  | none/readonly/full 分别运行控制面矩阵                           | 伪造查询、branch mutation 与更高 capability 回显        | none 零数据；readonly 只读；full 仅允许自身操作；wire 回显不能扩大本地配置                                                                  | ⬜   |
| 11  | session 达到 32 个请求或 2 个传输                               | 再登记一个                                              | 返回对应 limit 错误且不分配资源                                                                                                             | ⬜   |
| 12  | 连续完成 4,096 请求或 256 个传输                                | 再登记唯一 ID，并尝试复用旧 ID                          | 新登记返回 `session_budget_exhausted`，复用返回 duplicate；tombstone 数量不超过固定上限，轮换后旧 session 消息全部拒绝                      | ⬜   |
| 13  | 请求进行中或已超时                                              | 断连、重握手并投递迟到响应                              | 计时器和资源释放；迟到数据不进入新状态，旧 session 不复活                                                                                   | ⬜   |
| 14  | fake transfer 帧序列（不含真实 provider）                       | 分别制造 idle 静默、被拒帧刷新尝试和超长总时长          | 合法帧刷新 idle，被拒帧不刷新；idle 15 秒或总时长 10 分钟到期返回 `transfer_timeout`，临时资源释放且不复活                                  | ⬜   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

## 实现文件

- `packages/rxdb-devtools/src/` — v2 envelope、协商、session、授权、ID 预算、错误和生命周期
- `packages/rxdb-devtools/src/testing/` — fake 四段 relay 与 control-plane conformance suite
- `requirements/api-baseline/` — 若控制面新增公开类型则同步

## References

- [US-904b DevTools 共享 v2 协议与面板契约](./US-904b-devtools-shared-protocol-panel.md)
- [US-904b2 DevTools provider 数据面](./US-904b2-devtools-provider-data-plane.md)
- [版本与 API 稳定性策略](../../versioning-policy.md)
