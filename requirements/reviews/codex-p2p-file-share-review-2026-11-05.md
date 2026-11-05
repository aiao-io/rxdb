# Review：codex/p2p-file-share 分支评审

- **评审对象**：`codex/p2p-file-share` @ `6f1dfcbf`（2026-11-05，`feat(aiao): 简化 P2P 共享交互并增加本机管理`）
- **比对基线**：`origin/main` @ `7b0c4e9f`（merge-base 即 main；分支共 45 个提交，191 个文件，+18 069 / -91）
- **评审方式**：4 个领域并行静态评审（协议包 / Worker 服务端 / Angular 客户端 / e2e 套件）+ 主会话复核核心包与全部配置类改动；门禁在分支 tip 的只读 worktree 上实跑。未跑 lint / typecheck / test / build / e2e——本评审为静态评审，CI 为权威。
- **前情**：前次深度评审 `pr172-deep-review-2026-11-02.md`（基线 `3b8f5609`，3 P1 + 1 P2，已全部处理并删除）；此后分支新增 US-708 会话层、包改名 `@aiao/rxdb-plugin-p2p`、US-708 验收夹具（真实 WebRTC 双上下文 / 桌面双进程 TLS）与 6f1dfcbf 的交互大改。全文可用 `git show 88111633:requirements/reviews/pr172-deep-review-2026-11-02.md` 取回。

## 门禁复验（@ 6f1dfcbf 只读 worktree 实跑）

| 门禁                        | 结果                                                             |
| --------------------------- | ---------------------------------------------------------------- |
| `requirements-consistency`  | ✅ 89 Done / 9 In Progress / 10 In Review / 26 Backlog，合计 134 |
| `api-surface --check`       | ✅ 全部 59 个公开包、96 个公开入口与基线一致、命名合规           |
| `package-graph`             | ✅ 登记 60 包、发布 51 包（v0.0.28）、9 个情景                   |
| `subpath-inventory --check` | ✅                                                               |

说明：审计脚本以本机 `node` v24.18.0 运行（`node_modules` 软链自主 checkout），CI 用 Node 26，结论以 CI 为准。CI 接线无需 workflow 改动——e2e 矩阵按 `projects_json e2e / e2e-remote` 自动纳入 `dev-rxdb-p2p-e2e`（`e2e-remote` 行经 `.github/actions/supabase` 起本地 Supabase 栈），插件包经 `tag:js-lib` 进常规门禁。

## 核心包改动（packages/rxdb，本次评审亲核）

分支给核心包新增了两处公开行为，均为 P2P 插件补实体的宿主契约，结论**无问题**：

- [`RxDB.initialized`](../../packages/rxdb/src/RxDB.ts)：只读 getter，如实反映本连接纪元是否已走过 `init()`。实现与 TSDoc 声明一致：`init()` 置位（L688）、抛错回滚复位（L723）、拆卸窗口内保持 `true`、拆完复位；配套 spec 覆盖「init 前后 / 断连复位 / init 抛错回滚」三条。
- [`EntityManager.#bound_types`](../../packages/rxdb/src/entity/entity-manager.ts)：`init()` 成功时记录实际绑定的实体类，`destroy()` 按这份清单解绑而非读取拆卸时刻的 `config.entities`——插件作用域释放早于管理器销毁，插件摘掉的实体同样要解绑，否则实体类永久绑在已拆实例上、下一个实例被「registered with multiple RxDB instances」误挡。`RxDB.plugin-entities.spec.ts` 覆盖「插件摘掉实体后不再绑在旧实例上」与「旧实例断连后另一实例可独占同一实体类」两条契约。

消费方 [`RxDBPluginP2PFiles`](../../packages/rxdb-plugin-p2p/src/plugin.ts) 在构造期用 `initialized` 拦「init 之后才 `use()`」，实体留在本实例配置里跨连接纪元复用——与上面两条契约自洽。

其余亲核的配置类改动均合理：`board-recovery.spec.ts` 改为先 `waitForEvent('load')` 再轮询（修 CI 上 evaluate 撞导航被销毁）；Supabase CI action 与 `init-db.sh` 补建 p2p schema（PGRST002 根因）；docker realtime 网络别名；netlify 关 rspack 持久缓存（OOM 排障）；`pnpm-workspace.yaml` 拒绝 workerd 安装脚本；tsconfig 引用与 paths 完整；锁文件未动 wa-sqlite integrity。

## 前次评审修复抽查

前次 3 P1 + 1 P2 在 @ 6f1dfcbf 上**全部确认已修且未被回归**，四个领域独立抽查结论一致，无「说法不实」：

- 撤回墓碑：`P2PManifestStore.revoke` 的墓碑按版本只升不降（`Math.max`），`upsert` 被墓碑版本挡住；四个时序回归用例在位。
- WebRTC 空分片：`FragmentAssembler.add` 对短于 1 KiB 的非末片（含空片）直接判违反协议，分片数受字节预算约束。
- 服务器回退流式：`P2PServerFallback.download` 返回 `ReadableStream` + `StreamChunker` 逐块校验，缓冲有界、坏块不落盘、取消时取消响应流。
- 「候选领域未解锁却登记公共包」：已被 owner 2026-11-03 的解锁决定取代（epic-011「价值待证」记录），属治理决定而非代码偏离。

## 发现

### P1

#### P1-1 信令实例键可被任意已认证用户跨身份抢占：踢人下线、接管寻址、放大信号注入面（服务端）

**证据**：[`SignalingHub.#replaceStale`](../../apps/dev-rxdb-p2p/server/signaling-hub.ts) 只按 `key` 驱逐旧连接，不校验新旧连接的 `principal` / `deviceId` 是否一致：

```ts
#replaceStale(socket: HubSocket, key: string): void {
  for (const stale of this.#members().filter(member => member !== socket && peerOf(member).key === key)) {
    stale.detach();
    stale.close(CLOSE_REPLACED, 'replaced by a newer connection');
  }
}
```

而 `key` 直接取客户端自报的 `hello.instanceId`（[`SignalingRoom.#authenticate`](../../apps/dev-rxdb-p2p/server/signaling-room.ts) 的 `key: hello.instanceId`），协议层对 `instanceId` 只有非空校验（[`signaling-protocol.ts`](../../apps/dev-rxdb-p2p/shared/signaling-protocol.ts) 的 `isText`），且在线成员的 `key` 经 `presence` 整表广播给房间内所有已认证成员。

**失败场景**：任意已认证用户 Mallory 从 presence 读到受害者实例键 V，用自己的 token 和 deviceId 发 `hello(instanceId=V)`，服务端认证通过后 `#replaceStale` 关闭受害者的连接（4409）。(1) 受害者重连被反复踢掉——浏览器 peer 无信令就无法新建连接，持久 DoS；(2) 此后任何人对 V 发 `connect`，`connection` 与响应方票据发给 Mallory，票的 claims 以 Mallory 身份签发，demo 端 `authenticatePeerTicket` 校验 `claims.sub === expected.principal` 时 expected 恰是信令宣布的 Mallory 身份——会话静默落到 Mallory 手里；(3) Mallory 顺带拿到在途连接的 `connectionId`，使 P3-7 的 SDP/ICE 注入路径变为可行。

**复验**：读了 `#replaceStale` / `#greet` / `#find` 与 `signaling-room.#authenticate` 全文及 presence 广播内容；`signaling-hub.spec.ts` 的替换用例只覆盖同名替换，没有任何「只有同身份才能替换」的反例（见 P3-8）。**修复方向**：驱逐前校验新旧 peer 的 `(principal, deviceId)` 相同，或 `instanceId` 改为服务端分配/签名。

### P2（9 条）

#### P2-1 服务端：共享信令房间无速率 / 连接 / 成员上限，hello 字段无长度约束，presence 呈 O(n²) 放大且每次 hello 打两次 Supabase

**证据**：单例房间 `SIGNALING_ROOM = 'lobby'`（[`router.ts`](../../apps/dev-rxdb-p2p/server/router.ts)）承载全部署成员；`#authenticate` 每次做 1 次 `/auth/v1/user` + 1 次 `/rest/v1/devices`；任何 join/leave 触发向全员整表 `presence` 广播（`#publishPresence`）；全链路无速率限制、无每用户连接数上限；`p2p.devices` 的 INSERT 策略（[`p2p-schema.sql`](../../apps/dev-rxdb-p2p/supabase/p2p-schema.sql) L28-30）不限制每人设备数。`hello` 的 `accessToken` / `instanceId` / `deviceId` 只要求非空，`instanceId` 原样存入休眠附件并出现在每一条 presence 里。[`limits.ts`](../../apps/dev-rxdb-p2p/shared/limits.ts) 只有 `MAX_UPLOAD_BYTES` 一项。

**失败场景**：(1) 未认证者循环开 WS + 发垃圾 token 的 hello，每次白赚一次 Supabase auth 调用——Worker 成为打 Supabase 限额的放大器，把整个项目的认证打到限流、全员信令瘫痪；(2) 认证用户以接近运行时 WebSocket 消息上限（约 1 MiB）的超长 `instanceId` 反复 join/leave，每个成员每条 presence 都收到该字符串，DO 内存（128 MB 上限）与 CPU 被单用户推高。

**复验**：读了 `router.ts` 路由、`signaling-hub.ts` 全部成员函数、`signaling-protocol.ts` 的 `CLIENT_RULES`、`p2p-schema.sql` devices 策略；`limits.ts` 全文仅 4 行。

#### P2-2 服务端：files 上传的 100 MB 上限只靠声明式 `content-length` 与平台套餐，Worker 从不计数实际字节，且无每用户配额

**证据**：[`files.ts`](../../apps/dev-rxdb-p2p/server/files.ts) L51-53 只校验请求头 `content-length ≤ MAX_UPLOAD_BYTES`，随后把 `request.body` 整体流式交给 `bucket.put`；文件头注释承认真正的约束是 Cloudflare 免费 / Pro 域名的 100 MB 请求体上限。PUT 只要求「任意有效 token」，无每用户存储配额、无速率限制。

**失败场景**：Business+ 套餐下攻击者声明 `content-length: 100000000` 实发任意大的流（键 = sha256，攻击者自选内容即可匹配）绕过 413；或以海量 100 MB 请求灌满 R2 配额，使合法持有者的上传/回退路径失效。

**复验**：读了 `files.ts` 全文与 `limits.ts`；`files.spec.ts` 的 413 用例传的是与声明一致的真实长度，未覆盖「声明小、实际大」的流。

#### P2-3 服务端：签票私钥在本地以默认 0644 落盘且是未来离线凭据的根密钥；线上每次部署都轮换新钥

**证据**：[`dev-vars.mjs`](../../apps/dev-rxdb-p2p/scripts/dev-vars.mjs) L48 `writeFileSync` 未指定 mode（umask 默认 → 0644），`.dev.vars` 里明文写 `TICKET_PRIVATE_JWK`（Ed25519 私钥）与 anon key。该私钥按 US-704 认证合同是桌面离线凭据沿用同一公钥体系的根密钥。[`deploy-secrets.mjs`](../../apps/dev-rxdb-p2p/scripts/deploy-secrets.mjs) L14 每次运行都 `generateKey` 新钥——部署任何 secret 变更都会轮换签票钥，而 US-704 写明「公钥可缓存」。

**失败场景**：共享开发机 / CI 机上同机用户直接 `cat .dev.vars` 取得私钥；配合 US-707 阶段 B 的离线凭据落地后可伪造长期凭据。每次 `wrangler secret bulk` 造成一次全量握手失效窗口——缓存旧公钥的客户端对新钥签的票验签失败。

**复验**：读了 `dev-vars.mjs`、`deploy-secrets.mjs` 全文与 US-704 认证合同表。

#### P2-4 客户端：`PeerLinks.connect` 并发拨同一 peer 时等待表被覆盖，一个调用必然 10 秒误报超时并产生重复连接

**证据**：[`peer-links.ts`](../../apps/dev-rxdb-p2p/src/app/p2p/peer-links.ts) `#awaitOffer`（L129-140）`this.#waiting.set(peerKey, ...)`——同一个 peerKey 第二次调用直接覆盖第一个 handler，而第一个的 `setTimeout` 回调 `this.#waiting.delete(peerKey)` 会把第二个 handler 一起删掉；`connect`（L114-122）只在 `state === 'ready'` 时命中 `sessionWith`，两个并发调用都会再次 `requestConnection`（服务端因此分配两条连接）。

**失败场景**：用户并行下载两个文件（`download()` 对每个文件各调一次 `connect(peer.key)`），或 devices-panel 手动「连接」与一次下载同时发生。t≈2s offer1 到达 resolve 第二个调用，第一个在 t=10s 以「signaling did not set up a connection」拒绝——尽管会话已建好；offer2 到达时无人等待，第二条会话注册后被 registry 以 `duplicate` 关闭，连接列表多出幽灵行。失败自愈（重试复用会话），但错误信息完全误导排障。

**复验**：`peer-links.spec.ts` 的第二次 `connect` 发生在第一次 resolve 之后，duplicate 用例直接注入第二条 offer 绕过 `#waiting`——并发路径零覆盖。在 spec 里并发两次 `links.connect(peer.key)` 后立刻 `offer()`，第一条 promise 10s 后以超时拒绝可复现。**修复方向**：同 key 共享等待者数组，或已有 pending 时复用同一 offer。

#### P2-5 客户端：信令失败路径三处静默 / 卡死——凭据获取失败永久 `connecting`、4401 拒绝永不重试、服务端错误无消费方

**证据**：[`signaling-client.ts`](../../apps/dev-rxdb-p2p/src/app/p2p/signaling-client.ts)：

- `#open` L111 `await this.#options.credentials()` 无 catch，两个调用点 `void this.#open()`（L79、L149 重连 timer）——`AuthService.accessToken` 抛错时：未处理 rejection、state 停在 `connecting`、不再安排任何重试（重试只在 `#closed` 里安排，而 socket 根本没建）。
- `#closed` 对 `code === 4401` 置 `rejected` 后 return，永不重连；supabase-js 后台自动续期成功后没有任何机制重新 hello，只有整页刷新能恢复。
- `errors$`（L65）有 next，但 [`p2p-workspace.service.ts`](../../apps/dev-rxdb-p2p/src/app/p2p/p2p-workspace.service.ts) 的 `#startSignaling` 只订阅 `state$` 与 `peers$`——服务端主动发的错误（如 `peer_unavailable`）被静默丢弃。

**失败场景**：登录后网络瞬断恰好赶上重连窗口 → 永久「设备发现未连接」，网络恢复后不自愈；凭据过期后 4401 → 令牌被续期但信令永远 `rejected`，下载按钮全灰。同一主题的 app 层缺口：`AuthService` 发出 SIGNED_OUT 后 `app.routes.ts` 的 guard 只在导航时评估，工作区页无响应，唯一恢复是手动点「退出」。

**复验**：signaling-client.spec 无 credentials 拒绝用例，auth.spec 只测到 `accessToken` 抛错为止。mock `credentials` reject 一次后 resolve，断言 1s 后出现第二个 socket——当前实现不会。

#### P2-6 客户端：`#fail` 会在信令重连窗口内因 trickle ICE 转发失败杀掉已就绪会话，与 US-707 AC#6「已建连接继续」冲突（触发窗口窄，推断）

**证据**：[`peer-links.ts`](../../apps/dev-rxdb-p2p/src/app/p2p/peer-links.ts) `#signal`（L245）`sendSignal` 抛 `SignalingOfflineError`（信令非 online 即抛）→ `#fail(link)`（L250）→ `link.pc.close()` + `void link.current?.close()`——**不论会话状态**。`icecandidate` 监听器（L171）在会话就绪后仍存活；spec（L320-334）明确固化该行为：对 ready 会话断言 pc 与 session 双双关闭。

**失败场景**：直连刚建立（ICE gathering 未 complete，无 STUN/TURN 只有 mDNS host candidate）时信令 Worker 抖动重连（2s 循环），下一条 candidate 转发失败 → 杀掉一条本可继续传文件的会话。e2e AC#2 之所以绿，是因为断网发生在 gathering 早已完成之后。

**复验**：单测在 `resolveReady()` 后派发 `icecandidate` 且 `sendSignal` 抛错，断言当前实现会 close 会话可复现。**修复方向**：`#fail` 仅对未就绪 / 握手阶段生效；就绪会话的候选转发失败忽略并记录。

#### P2-7 协议包：慢认证握手必死——`#verify` 期间 pump 阻塞、不派发任何帧，对端心跳判 `peer_lost` 误杀健康会话

**证据**：[`session.ts`](../../packages/rxdb-plugin-p2p/src/session/session.ts) `#pump` 先 `await this.#handshake(await this.#receive())`（L494），`#handshake` 内 `await this.#verify(frame.credential)`（L512）。verify 期间读循环不在跑：收不到也**不应答**任何帧；对端在 ~2s 就绪后开始心跳，连续 `missedBeatLimit` 个周期（默认 3×5s）收不到帧即 `#shutdown('peer_lost')` 拆会话。verify 期间对端发来的小帧积压在 `FrameInbox`（上限按字节，小帧积不到），verify 完成后若积压超过 32 个请求帧，`#admit` 直接判 `protocol_violation` 杀掉会话。

**失败场景**：一端 authenticate 慢（>22s，认证宿主网络抖动），另一端健康——会话被拆，且双方得到的都是误导性原因（`peer_lost` / `transport_failed`）。触发条件（认证宿主慢于 ~20s）按 US-704 的 Supabase 合同属现实场景，标注**推断**；机制本身确定。

**复验**：读完 `#pump` / `#handshake` / `#beat` 完整控制流，确认握手完成前心跳定时器与派发循环都未启动；`session.spec.ts` 无「authenticate 慢 + 对端心跳超时」用例。**修复方向**：verify 期间继续应答 ping，或文档化 verify 时延上限。

#### P2-8 协议包：ping 洪泛——pong 控制队列无界增长，批量帧（文件块）永久饿死

**证据**：[`session.ts`](../../packages/rxdb-plugin-p2p/src/session/session.ts) `#dispatch` 的 `case 'ping': this.#post(encodeP2PFrame({ kind: 'pong' }), false)`（L543）与 `FrameSender.#next` 恒为 `this.#control.shift() ?? this.#bulk.shift()`（L310）。`FrameInbox` 的 8 帧×1MB 背压挡不住它——pump 立刻消化 ping 并转成 pong，而 `#control` 队列**没有上限**。

**失败场景**：已认证（或伪装的已认证）对端以链路速率持续发 ping：pong 入队快于链路发送则内存无界增长；同时 `#next` 永远先取控制帧，文件块的批量应答被无限期饿死——大文件传输停摆但会话不死。全包为每个队列（请求 32、收件箱 8、并发 8）都设了上限，唯独 ping→pong 这条路径没有预算。

**复验**：读了 `#dispatch`、`FrameSender` 与 `session/limits.ts`；测试里「控制帧优先」只有单向断言，没有洪泛或队列上限用例。**修复方向**：限制未决 pong 数（队列已有 pong 时丢弃新 ping），或给 ping 设速率 / 计数预算。

#### P2-9 e2e：US-708 AC#9 帧序断言与默认心跳竞态，低频红（每次运行约 0.2-2% 概率）

**证据**：[`browser-webrtc.spec.ts`](../../apps/dev-rxdb-p2p-e2e/src/browser-webrtc.spec.ts) AC#9（`gateSends` → 8 个并发块请求 → `probe` → `releaseSends`，断言 `expect(pong).toBe(1)` 与 `overtaken` 恰 7 条）；`harness.ts` 的 `recording.send` 先挡 `await sendGate` 再记 trace；会话默认心跳 `DEFAULT_HEARTBEAT_INTERVAL_MS = 5_000`，`#beat()` 每拍无条件 `#post(ping)`。

**失败场景**：心跳 tick 落在 `gateSends` 与首个 bulk 应答到达发送器之间（约 10-100ms 窗口，CPU 竞争时放大）→ ping（或对端心跳 ping 的 pong 应答）成为闸口第一个放行的帧 → `responses[0]` 变成 probe 应答 → `pong === 0` 红。重试掩盖，属时序敏感断言。

**复验**：该用例两端显式传 `heartbeatIntervalMs: 50` 连跑多次可观察到；或检索 CI 该行断言失败历史。**修复方向**：AC#9 给会话传大心跳间隔（10 分钟，`integerOption` 上限允许），或把断言改为「`responses[0]` 是 bulk 且 probe 应答先于其余 7 个 bulk」，对心跳帧鲁棒。

### P3（19 条）

**服务端**：

- **P3-1** [`router.ts`](../../apps/dev-rxdb-p2p/server/router.ts) 未兑现 [`files.ts`](../../apps/dev-rxdb-p2p/server/files.ts) TSDoc 声明的 502 契约：`handleFileRequest` 无 try/catch，`verifyAccessToken` / `findOwnDevice` 对宿主非 401/403 故障抛错、`bucket.get` 失败抛错——直冲 workerd 默认 500，dev 环境错误页回显宿主错误文本。复验：对比读 `router.ts` 与 `files.ts` TSDoc。
- **P3-2** [`dev-vars.mjs`](../../apps/dev-rxdb-p2p/scripts/dev-vars.mjs) 读-改-写仍非原子：`readPrevious()` → 正则取旧 key → `writeFileSync` 整体重写，无锁 / 原子写。并发 nx 目标（本地 e2e 多 spec 并行起 `e2e-serve.sh`，每次起服务都调 dev-vars）后写者覆盖先写者，运行中的用例握持旧 key 验签失败——e2e 假红来源。复验：读 `dev-vars.mjs` 全文与 `e2e-serve.sh`。
- **P3-3** [`signaling-hub.ts`](../../apps/dev-rxdb-p2p/server/signaling-hub.ts) `#relay` 不校验收发双方是否属于该 `connectionId`：服务端不保存任何「谁属于哪条连接」的状态，`connectionId` 内容由客户端自报。正常路径 `crypto.randomUUID()` 不可猜，但 P1-1 的接管使攻击者能拿到在途连接 ID，或任何观察到该 ID 的房内成员即可向谈判两端注入伪造 offer / ICE（替换 SDP 的 DTLS 指纹可使对端与攻击者完成会话）。复验：读 `#relay` 与 `signaling-client.ts` 的 message 分发，未找到任何连接成员状态。
- **P3-4** spec 缺口：`signaling-hub.spec.ts`「replaces an older connection of the same instance」只断言同 key 替换成功，恰把 P1-1 固化为期望；全 spec 无 hello 字段长度上限、信号频率、每用户连接数、上传「声明长度≠实际字节」的断言。复验：读三个 server spec 全文与 e2e `server-contract.spec.ts` 断言点。
- **P3-5** [`connection-ticket.ts`](../../apps/dev-rxdb-p2p/shared/connection-ticket.ts) 票据无 `nbf`，`verifyConnectionTicket` 只用对端自报的 `now` 做过期判定——对端时钟领先则窗口被压缩（握手失败面扩大），落后则过期票继续被接受（300s TTL 上限失效）。轻微边界问题，非独立可利用。复验：读 `verifyConnectionTicket` 与 `tickets.ts` 的 `exp` 计算。

**客户端**：

- **P3-6** [`peer-links.ts`](../../apps/dev-rxdb-p2p/src/app/p2p/peer-links.ts) 响应方连接无超时：`#accept` 只挂 `datachannel` once 监听，datachannel 到来前不创建会话（插件 hello 超时救不了这段窗口），全文件无 `connectionstatechange` / `iceconnectionstatechange` 监听。对端发出 connect 后立刻关页 / ICE 卡死 → link 永远停在 `connecting`、pc 永久残留。initiator 侧同场景有 hello 超时兜底，responder 侧没有。复验：单测注入 responder offer 后不发任何 signal，推进 fake timers 数分钟，`links$.value` 仍为 `connecting` 可复现。
- **P3-7** [`p2p-workspace.service.ts`](../../apps/dev-rxdb-p2p/src/app/p2p/p2p-workspace.service.ts) `#runDownload`（L439-440 附近）P2P 部分完成后回退服务器：`writeChunk` 无条件 `progress.written(index, bytes.byteLength)`，[`fallback.ts`](../../packages/rxdb-plugin-p2p/src/fallback.ts) 的 `storeServerStream` 从 0 号块重写整个文件，[`transfer-progress.ts`](../../apps/dev-rxdb-p2p/src/app/p2p/transfer-progress.ts) `written`（L91）只累加不回退、`#deliveredBy` 不清除——进度字节重复累计、块图来源归因漂移（纯显示漂移，落盘与校验正确）。复验：workspace spec 里 mock 传一半即失败的 source + serverCopy，观察 `transfers()[0]` 的 `bytes > size`。
- **P3-8** [`p2p-workspace.service.ts`](../../apps/dev-rxdb-p2p/src/app/p2p/p2p-workspace.service.ts) `#runDownload` 在 `await writer.commit()` 之后 `#claim` 失败（约束冲突 / 本地库故障）→ 异常落入 catch → `writer.discard()` 作用于已 close 的 writable（语义不确定）→ 传输标记 `failed`，但文件已完整落盘——状态与真实情况漂移，错误信息指向下载而非登记。复验：mock `persistence.save` 在 claim 阶段 reject，断言 transfer state 为 `failed` 且 `writer.commit` 已被调用。
- **P3-9** 测试空洞：并发 `connect()`（P2-4）与信令失败恢复（P2-5）无任何用例——`peer-links.spec.ts` 的 duplicate 用例绕过 `#waiting`，`workspace.spec.ts` 把 PeerLinks 与 SignalingClient 整个 mock 掉，会话生命周期与信令的集成行为零覆盖。

**协议包**：

- **P3-10** [`registry.ts`](../../packages/rxdb-plugin-p2p/src/session/registry.ts) 同向重复连接去重依赖各端到达序：`preferredSession` 的 `if (current.role === incoming.role) return current` 是各端本地的，US-708 技术笔记「两端选中同一条连接」只对反向同时拨号成立。双拨走不同信令路径时，A 保留 conn1、B 保留 conn2，随后各自把对方保留的连接以 `duplicate` 关掉，两边 registry 都清空需重拨。不损坏数据，但 AC#8 去重语义不可靠。复验：读 `preferredSession` 并用两端的身份键手算两种情形；`registry.spec.ts` 只覆盖同一方向先后登记的温和时序。
- **P3-11** [`session.ts`](../../packages/rxdb-plugin-p2p/src/session/session.ts) 心跳判失联的实际时长是 `(missedBeatLimit+1)×interval`：`#receivedSinceBeat` 初值 true，第一个周期只发 ping 不计数（L630 附近），默认参数下判定发生在 20s 而非文档声明的 `heartbeatTimeoutMs`（15s）。US-708 AC#5「在心跳超时内以对端失联结束会话」偏差一个完整间隔；`session.spec.ts` 的失联用例以 100/300 参数断言「399ms 仍 ready、499ms 判失联」把 4×interval 固化为预期——实现语义而非笔误。复验：读 `resolveTiming` / `#beat` 并用默认参数推演 4 个周期的 missedBeats 序列。
- **P3-12** [`chunking.ts`](../../packages/rxdb-plugin-p2p/src/chunking.ts) `describeChunk` 是公开 API（index.ts 全量 export），只校验 `index < chunkHashes.length` 不校验 `offset < size`：传 `size=10, chunkSize=8, chunkHashes=[h0,h1,h2]` 且 index=2 时返回 `size: 10-16 = -6` 的负长度描述符。包内路径都先过 `describeChunks` 的长度校验所以内部不可达，但对宿主是公开原语。复验：读 `describeChunk` 并 grep 确认包内仅 `describeChunks` 调用它。

**e2e**：

- **P3-13** [`browser-webrtc.spec.ts`](../../apps/dev-rxdb-p2p-e2e/src/browser-webrtc.spec.ts) 大量 `expect(await call(...))`——await 在 expect 之外，expect 超时完全不约束等待：会话层回归导致 `closed` 永不兑现时用例烧满 60s/120s 测试超时 × 3 次重试才红，而非 5s 快速失败。同文件 `connectedPair` 与桌面 spec 全部 `.resolves` 写法，两端不对称。复验：让 harness 的 `closed` 不 resolve，观察用例用时。
- **P3-14** [`browser-webrtc.spec.ts`](../../apps/dev-rxdb-p2p-e2e/src/browser-webrtc.spec.ts) AC#5 用例 1 的墙钟断言 `toBeLessThan(5_000)` 叠加 bob 页 20s 忙等烧核：GitHub runner 2 vCPU 下 bob 渲染进程吃满一核，alice 渲染进程的 200ms 心跳定时器漂移 → `peer_lost` 检测推迟 → `closed` 兑现超 5s → 红（与真实协议无关）。项目自定口径「多源正确性不使用墙钟断言」同样适用于心跳延迟断言。复验：CPU 受限容器重跑该用例。
- **P3-15** 固定端口 4371（`harness-api.ts` L6）/ 4382（`demo/fixtures.ts` L18）+ `reuseExistingServer: false` 撞本机服务：4371 被占 `serve.ts` EADDRINUSE 立即红（可接受）；4382 被占要等 webServer 240s 超时才红。仓库有 BOM e2e 4311 撞用户 dev server 先例。复验：本地占住两个端口分别跑两套 config。
- **P3-16** [`peer-process.ts`](../../apps/dev-rxdb-p2p-e2e/src/desktop/peer-process.ts) `call` / `nextEvent`（L47）无单调用超时：IPC 消息丢失、TCP 写缓冲塞满、命令实现挂起时 promise 永不 settle，整个用例挂到 60s/120s 测试超时且重试同样挂满。复验：在 `peer.ts` 的 `run()` 里对某个 method 不回复，观察用例用时。
- **P3-17**（推断）本地首跑 demo e2e 的 webServer 180s 超时可能不够：`playwright.demo.config.ts` 本地分支先跑 `supabase-up.sh`（docker compose up + 灌表结构）再起 wrangler，首次镜像拉取 / 冷启超 3 分钟即判定失败。复验：清掉 docker 缓存后首跑 `e2e-remote`。

**工程**：

- **P3-18** [`rxdb-plugin-p2p/package.json`](../../packages/rxdb-plugin-p2p/package.json) 声明 `@aiao/utils` 依赖但源码零 import（`vite.config.mts` 还把它列进 external）——发布后消费端多装一个无用包。复验：`grep -rn "@aiao/utils" src/` 无命中。
- **P3-19** [`dev-rxdb-p2p/package.json`](../../apps/dev-rxdb-p2p/package.json) 只声明 `wrangler`，而源码直接 import `@supabase/supabase-js`（`auth.service.ts` 等四处）与 `rxjs` 等第三方包，靠仓库根 node_modules 的 hoisting 解析（phantom dependency）。仓库既有 demo app 不跟踪 manifest、依赖同源解析是惯例，但第三方直接依赖显式声明可免疫 hoisting 变化——与「app 自己声明 wa-sqlite」的先例同口径。复验：`git ls-tree origin/main` 下全部 demo app 均无 manifest；grep 确认 import 来源。

## AC 对齐与真实性核对

- 四个领域逐条核对 US-704 / 705 / 706 / 707 / 708 的 AC 声明：**未发现声称满足但代码 / 测试未到的 AC**，故事里的 ✅ / ⚠️ / ⬜ 状态列与实现证据一致（浏览器半边 e2e 有真实断言；阶段 B 与依赖身份的 AC 诚实标 ⬜）。唯一与 AC 语义有张力的实现点是 P2-6（已建会话在信令抖动窗口被主动关闭）。
- e2e 真实性防线核实通过：浏览器用例 `iceServers: []` + 关 mDNS + 回环地址 + SDP 由用例手工搬运，直连无中继可能；桌面 `fork` 两个干净 Node 进程 + `listen(0)` + PSK 套件真握手，且 `createTcpTransport` 对 `socket.encrypted !== true` 抛错——TLS 被换成明文测试必红；AC#2 流量隔离证据链成立（无服务器副本 + 双端 `route.abort` + 信令 socket 主动关闭）；大字节比较已全部改为 digest 十六进制字符串比对。
- 核心包 `RxDB.initialized` / `EntityManager.#bound_types` 属成员级新增（非导出名），api-surface 门禁不拦、基线一致；api-baseline 无 diff 属预期。

## 总评与建议

这个分支的工程质量整体明显高于一般实验分支：协议层各队列有明确上限、失败路径有回归测试，前次评审三处 P1 的修复都扎实落地；demo 客户端「错误要可见」执行严格，AC 声明与证据一一对应、无虚报；e2e 的假绿防线（直连真实性、流量隔离、TLS 强制加密）有可证伪断言。残余问题集中在两处「没有预算」的路径——服务端信令面（P1-1、P2-1、P2-2）与会话层的控制帧优先设计（P2-7、P2-8）——以及客户端会话生命周期对异常时序不收敛（P2-4、P2-5、P2-6）。

**合并前建议至少修**：P1-1（替换须校验同身份，改动小、风险高）、P2-1 / P2-2（信令面补速率、长度、成员上限与应用层字节计数）、P2-4 / P2-5（并发拨号与信令失败恢复，补回归用例）、P2-7 / P2-8（握手期应答 ping、pong 队列预算）、P2-9（AC#9 与心跳解耦）。其余 P3 多为边界打磨与显示漂移，可分批处理或随上述修复顺手带掉。
