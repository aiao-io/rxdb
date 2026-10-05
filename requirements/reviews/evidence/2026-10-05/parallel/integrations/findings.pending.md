# integrations 待主控去重/复验候选（2026-10-05）

本子任务不分配 RV，不修改已有 RV。**新增动态确认：0**。下列是源码可定位、但本轮未执行的新测试/真实宿主场景；不能写成已复现失败。RV-059/060/061 仍 Open，仅引用；RV-058 已 Resolved，历史 401 / SWR / outbox 修复不重新登记。

## 候选 A：HTTP 合批变更归给最后一名写入者，通知可能被错误当作自回声（建议 P2，未动态复验）

- 对象：`dev-rxdb-http-server` C4、`dev-rxdb-http-e2e` C4；客户端链路 `rxdb-adapter-http` C3。
- 根因锚点：`apps/dev-rxdb-http-server/src/change-broadcaster.ts:47–68`：注释明确 PGlite 会聚合相邻多次写入；`recordWrite` 每次覆盖单槽 `pendingClientId`，第一条 Recipe 事件消耗 `hasPendingWrite`，整批广播最后一名写入者。`server.ts:158–160,206–226` 在写成功后记录请求身份。`packages/rxdb-adapter-http/src/change-feed.ts:322–343` 对同 clientId 的通知直接 return，不失效远端实体。
- 可复验接缝：新增 `apps/dev-rxdb-http-server/src/__tests__/review-parallel-change-broadcast-origin.spec.ts:35–54`。原 RxDB 事件分派、原 broadcaster、mock SSE 出口；对照为单写入者仍回显 A；目标场景为依次记录 A/B 两次成功写，再派发含两行的聚合 UPDATE，期待实体级失效不带独占的 B 身份。**未跑**；本测试证明的是聚合契约/记账，不能代证真实 PGlite HTTP 时序或浏览器的最终可见性。
- 真实剩余复验：隔离临时 PGlite demo server、两个不同 `x-client-id` 的调用方，在同一 native NOTIFY batch 窗口修改不同 Recipe；记录原始事件、SSE 与客户端 `suppressed/invalidate`，验证 B 至少获得能覆盖 A 修改的远端失效。不以单页面自己的写后 refetch 偶然补齐来证明通知身份正确。批次若没合并应作为正常对照，不强行断言失败；需要记录实际 batch。
- 影响边界：仅变更流启用且不同写入者落入同一聚合事件的情况；单写入者的自回声优化不是缺陷。源码单进程/串行 DB 写入不能保证 batch 内只有一个 client。
- 最小修复方向：不能把混合来源的合批事件标为最后一人的独占自回声；来源无法对应原事件时退化为无 `clientId` 的实体失效，保留可确证单来源的优化，并确保一次 flush 的不同 CREATE/UPDATE/REMOVE 事件不会因第一条消费槽位而漏广播。不要用 FIFO（当前已明确批次非 1:1），不要扩大到 core/plugin 改造。
- 回归边界：同一 client 两次写、不同 client 两次写、create/update 混合、内部 reset/seed 与外部写邻接、失败写不污染来源、feed 关闭后无资源残留。
- 去重：已搜索现有 RV 的 clientId/SSE/回声描述，未找到同根因编号；交主控再次全仓去重。仅静态候选，不算当轮失败数。

## 候选 B：Supabase remote E2E 失败时不回收已推送 Todo，成功路径也未确认远端删除（建议 P2，旧缺口细化，未动态复验）

- 对象：`dev-rxdb-supabase-e2e` C5；不把未认证 demo 本身当新权限缺陷。
- 根因锚点：`apps/dev-rxdb-supabase-e2e/src/remote-sync.spec.ts:24–59`：先创建并 Push，再断言第二 context 拉到；`finally:50–52` 只关闭第二 context。删除/再次 Push 仅在全部前序断言成功后运行（54–58）；最后只确认 mutation **请求数量**增加，没有确认响应或另一 context 读不到该行。任何 Push 后断言失败都会跳过数据清理。第二个测试 61–96 的未 Push 行仅属隔离本地 context，不等同远端污染。
- 已有记录的“cleanup 仍待加强”是本候选的历史来源；没有编号、没有新跑，不宣称全新动态发现，也不重复 RV-059/060/061。
- 可复验：仅在明确受控 checkout-isolated Supabase Docker stack 和唯一测试 scope 上运行；成功 Push 后故意在跨 context 可见性断言处失败，使用受限测试身份查询唯一 title/id，确认有无残留；再测删除 RPC 发出但返回拒绝/失败的情况。不访问现有 .env 指向的未知/生产远端。
- 最小修复：把自己创建的远端资源登记到 fixture 的 try/finally/teardown，按唯一 id/scope 删除并从受限身份的远端读取确认消失；回收失败要保留原始测试失败与 cleanup 失败，不能吞错。不要在页面注入 service-role key，不删除别的测试/用户的数据。
- 边界：Push 超时但实际写入、删除被 RLS 拒绝、重试/中断、两个并行用例、正常删除确认、stack 关闭前 teardown。

## 已排除/保留为验证缺口（不新增 RV）

- HTTP 条件缓存不含 auth header，但 `packages/rxdb-adapter-http/README.md:227–231` 明确换身份必须 disconnect/connect；`RxDBAdapterHttp.connect/disconnect` 重建 transport 并清缓存。不能把违背公开前置条件的 token 直接切换当新缺陷。真实身份切换按此路径补证。
- HTTP demo `server.ts:94–100` 允许无 Authorization，只验证 Bearer 形状；`cors.ts:52–74` 回显 origin，`main.ts:49` 绑定 loopback。这不是生产 Auth/RLS 拒绝证据，也不是本轮新发现的 401 缺陷。
- Supabase remote E2E 断言警告“未启用身份认证”（21–22/71），没有受限用户跨身份拒绝链路；2 remote /4 local 旧成功不核销 C4。
- Tauri release-isolation 的结构/regex+cargo-check 断言不是 release WebView 真实授权证明；cargo/两档 smoke 未跑必须保留未验证。
