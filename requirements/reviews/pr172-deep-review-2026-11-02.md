---
id: review-pr172-2026-11-02
title: PR #172 P2P 文件共享分支深度评审
status: Open
created: 2026-11-02
updated: 2026-11-02
pr: https://github.com/aiao-io/rxdb/pull/172
---

# PR #172 深度评审：P2P 文件共享

## 评审结论

🔴 当前分支不建议合并。协议单测和包级质量门禁是绿的，但清单撤回的版本语义仍可被旧同步事件破坏，WebRTC 分片接收器仍可被空分片耗尽内存；同时该分支把仍处于价值待证 / Backlog 的候选领域直接登记成可发布公共包。先修复 P1，再完成领域立项和真实宿主验收。

## 基线与范围

- PR：[#172](https://github.com/aiao-io/rxdb/pull/172)
- 分支：`codex/p2p-file-share`
- HEAD：`3b8f5609b9e2d249e0a0977d99199bb4f354fec8`
- 基线：`94e89be7dcd25575d2f9b5d560e1861fc645e78c`（`origin/main`）
- 变更范围：`@aiao/rxdb-plugin-p2p-files` 全部清单、发现、传输、WebRTC/TLS TCP、服务器回退和插件生命周期代码；RxDB 实体绑定；包图、API baseline、生成知识和能力矩阵。

## 发现

### P1：旧撤回事件可以删除更新后的持有声明，并且重复撤回会抹掉墓碑

证据：[`P2PManifestStore.revoke`](../../packages/rxdb-plugin-p2p-files/src/manifest.ts) 的实现先用当前记录的 `updatedAt` 和本次 `revokedAt` 写入 `#revokedAt`，没有与已有墓碑取最大值（`manifest.ts#L214-L220`）：

```ts
this.#revokedAt.set(id, Math.max(this.#records.get(id)?.updatedAt ?? -1, revokedAt ?? -1));
return this.#records.delete(id);
```

同步时序 `upsert(updatedAt=300)` → 延迟到达的旧 `revoke(revokedAt=100)` 会把当前行删掉；反过来，先 `revoke(revokedAt=50)` 再重复一次不带时间的 `revoke()` 会把墓碑降为 `-1`，随后旧 `upsert(updatedAt=50)` 又能复活。临时回归用例在该 HEAD 上 4 条中 3 条稳定失败（包括这两个时序以及旧撤回删除新行）。

这直接违反 `US-704` 的“显式删除撤回声明、同步晚到不能恢复旧持有关系”语义。修复时应把墓碑按 ID 做单调 `max(existing, revokedAt, removedRecord.updatedAt)`，并只在声明版本不新于撤回版本时删除当前记录；补重复撤回、乱序撤回、旧撤回/新声明的交错回归。

### P1：WebRTC 空的 `MORE` 分片可以无限增长内存

证据：[`FragmentAssembler.add`](../../packages/rxdb-plugin-p2p-files/src/webrtc-transport.ts) 对 `MORE` 分片只累加长度并把 `message.subarray(1)` 放进 `#parts`（`webrtc-transport.ts#L67-L81`）。`[0]`（MORE）没有有效负载时长度保持 0，因此永远不会触发 `MAX_FRAME_SIZE`，只会不断追加空的 `Uint8Array`。在临时回归中向一个通道注入 100,000 个零载荷 MORE 消息后，通道仍保持 `open`；攻击者可持续发送直至进程内存耗尽，且该连接没有按帧/分片数上限。

协议应拒绝空 MORE、限制单帧最大分片数，或在分片接收状态上维护有界字节/片数预算；补空 MORE、连续 MORE 超限以及收到 LAST 后状态清理的回归。

### P1：候选领域仍未解锁，却在分支中登记成可发布公共能力

`epic-011` 明确写着四条故事仍为 `Backlog`、价值门禁未关闭且“不授权开工”（[`epic-011-p2p-file-share.md#L28-L34`](../epics/epic-011-p2p-file-share.md)）；`US-704` 还要求先选定真实认证宿主、服务端授权合同和离线凭据（[`US-704-p2p-manifest-discovery.md#L20-L26`](../stories/future/US-704-p2p-manifest-discovery.md)）。本 PR 却新增公开 `@aiao/rxdb-plugin-p2p-files` 包、RxDB 实体注册、包图、baseline 和 capability-matrix 入口。

当前代码没有真实同步服务器授权合同、mDNS/桌面握手实现、Electron/Tauri 双进程或 Playwright 多实例/流量隔离验收；PR 描述也承认这些宿主接缝仍由应用自行接入。按 `AGENTS.md` 的候选领域治理，这不是“核心包先行”即可绕过的范围：应先完成立项/范围评审，明确宿主归属与关闭条件；在此之前将候选代码保持在实验分支或不登记为产品包。至少补真实认证宿主、跨运行时验收和价值门禁证据，不能把 103 条内存协议测试当作领域交付证明。

### P2：服务器回退的 `Uint8Array` 形态仍将整文件读入内存，和大文件缓冲承诺不一致

`P2PServerFallback.download` 接受 `Uint8Array | Blob`（[`fallback.ts#L8-L13`](../../packages/rxdb-plugin-p2p-files/src/fallback.ts)），而 `downloadFromServer` 在拿到 `Uint8Array` 后只能从已经完整驻留内存的数组切块（[`fallback.ts#L50-L53`](../../packages/rxdb-plugin-p2p-files/src/fallback.ts)）。只有 `Blob` 路径使用 `slice().arrayBuffer()` 分块读取。US-705 AC#8 要求内存不随文件大小线性增长；公共回退接口应改为受控的 range/stream reader，或明确只允许 Blob/流并给出大文件回归，避免 HTTP 适配器把 1 GiB 响应先物化为单个 `Uint8Array`。

## 三框架与 API 对称

该包是框架无关 service 层，按 epic 的边界不应新增 Angular/React/Vue 绑定包；因此没有“三框架绑定缺端”问题。包入口、TSDoc、API baseline 和 package API 文档审计均覆盖新增导出；但真实 browser/Electron/Tauri 宿主和三运行时 e2e 尚未交付。

## 验证记录

- `pnpm nx run rxdb-plugin-p2p-files:test --maxWorkers=1 --parallel=1 --skipRemoteCache`：通过，10 个 test files / 103 tests；覆盖率 statements 96.30%、branches 91.01%、functions 96.65%、lines 99.58%。
- `pnpm nx run-many -p rxdb-plugin-p2p-files -t lint typecheck --parallel=1 --skipRemoteCache`：通过；依赖包 build/typecheck 也通过。
- 针对 P1 撤回时序与空 MORE 分片的临时回归：4 条均失败，其中撤回三条和空分片一条分别复现上述缺陷；临时文件已从工作树删除。
- `rxdb` 定向测试在当前共享依赖环境中因 `@vitest/coverage-istanbul` 动态模块加载失败而无法执行（152 个文件被跳过、459 个准备错误），不据此判断业务回归。
- 未验证真实认证服务、同步服务器、mDNS、WebRTC 浏览器双上下文、Electron/Tauri 双进程、TLS 实际 socket 和大文件内存曲线。
