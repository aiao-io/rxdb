# 2026-10-05：Supabase、真实 QueryCache 与应用/E2E 联审

## 1. 执行范围与结论

**执行中，新增 3 个 P2，均 Open；不修业务，不给全对象通过。** 本批基线 `b7edef590051c8842d4914e30e31475977dea6ac`，日期按客户端测量时间。六对象：rxdb-adapter-supabase、rxdb-adapter-sqlite-core、rxdb-adapter-wa-sqlite、rxdb-plugin-querycache、dev-rxdb-supabase、dev-rxdb-supabase-e2e。

| 意见                                                              | 确认结果                                        | 实测边界                                                        |
| ----------------------------------------------------------------- | ----------------------------------------------- | --------------------------------------------------------------- |
| [RV-059](RV-059-supabase-bulk-delete-url-overflow.md)             | 大批量删除 URL 超长，400 行仍在                 | 原 SDK/Chromium + CI Kong/PostgREST；80 成功，原生 414          |
| [RV-060](RV-060-supabase-querycache-relation-metadata-missing.md) | metadata 丢失关系上下文，公开 QueryCache 也失败 | 真实 User/Order、exists/notExists、已落库对照                   |
| [RV-061](RV-061-querycache-sqlite-nonpublic-namespace-target.md)  | 非 public 冷缓存写成裸 User 表                  | 原 wa-sqlite MemoryAsyncVFS/sqlite-core；shop$user 实际写入对照 |

不重新登记已修旧问题；0 个全对象深审完成，没有新增完整 C 专题核销。评级只针对本轮已证实路径：**🔴 两条 Supabase 读/写边界和 SQLite QueryCache 身份映射需修；不能据此给整包其余能力下定论。**

## 2. 实际测量与门禁

| 测量                       | 结果                                                     | 证据                                                                                                                                    |
| -------------------------- | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 原 Supabase 整包基线       | 34 files /553 passed                                     | [日志](evidence/2026-10-05/supabase/supabase-baseline.txt)                                                                              |
| 最终新增复验               | 9 条：5 failed /4 passed /0 skipped                      | [聚焦日志](evidence/2026-10-05/supabase/supabase-delivery-focused.txt)                                                                  |
| 最终 Supabase 整包         | 557 passed /5 failed /0 skipped；原 553 条逐例保留通过   | [整包日志](evidence/2026-10-05/supabase/supabase-delivery-all-tests.txt) / [JUnit 比对](evidence/2026-10-05/supabase/final-counts.json) |
| 应用整套单测               | 10 files /47 passed                                      | [日志](evidence/2026-10-05/supabase/app-all-tests.txt)                                                                                  |
| 默认 local E2E             | 4 passed，当前生产构建后静态服务，无重用旧 server        | [日志](evidence/2026-10-05/supabase/e2e-local.txt)                                                                                      |
| 显式 remote E2E            | 2 passed，两个 browser context 的真实远端推/拉与未推负向 | [日志](evidence/2026-10-05/supabase/e2e-remote.txt)                                                                                     |
| 六对象严格 lint            | 通过，--max-warnings=0                                   | [日志/状态 JSON](evidence/2026-10-05/supabase/six-object-strict-lint.txt)                                                               |
| 六对象 typecheck           | 通过，6 个 target +30 个依赖任务；不冒充 spec 全通过     | [日志/状态 JSON](evidence/2026-10-05/supabase/six-object-typecheck.txt)                                                                 |
| 新增两个 spec 独立类型检查 | 通过，原 spec 配置/依赖 helper；不用 any/忽略诊断        | [日志](evidence/2026-10-05/supabase/new-spec-types-delivery.txt)                                                                        |
| 原有 spec 独立类型检查     | 失败：三份旧 spec 共 9 条诊断                            | [日志](evidence/2026-10-05/supabase/existing-spec-types-delivery.txt)                                                                   |
| 当前 build 后凭证审计      | 通过，独立重新构建后审计 44 个产物文件                   | [日志/状态 JSON](evidence/2026-10-05/supabase/app-post-build-credential-audit.txt)                                                      |

普通 adapter:typecheck 只检查 lib，不等同于 spec TS strict。新增复验以生成的 UserStaticTypes 校验关系条件，在 core 仓储泛型/unknown duck 的现有边界做显式类型转换；没有将关系条件替换为无效字段。取证脚本 [可重新生成临时 spec 配置并运行](evidence/2026-10-05/supabase/spec-type-probe.py) 保留配置体与命令，临时文件只在内容未被外部修改时删除。原有 9 条诊断未修改，也没有把失败 gate 写成全绿。

所有主命令通过 pnpm/Nx，串行，禁本地/远端缓存，coverage 关闭。本批没有跳过依赖任务。E2E 不指定部署地址、不使用生产帐号；remote 子进程显式注入当前 checkout 隔离 CI URL/公开 anon fixture，优先于 serve-remote 会解析的根 .env，不能把这些无认证 demo 表算成 RLS 隔离验收。

## 3. 接缝、反证与取证自身错误

- fetch 包装只量实际 URL 长度、HTTP/status 0 和错误；没有 mock 网络返回。原生 HTTP 的长 DELETE 是随机不存在 UUID，因此不额外删除数据。
- 1100 行 upsert 完整保存/返回，否定“看到 max-rows 就报告大 POST 截断”。不规范授权、身份绕过未在本批确认；应用已有无认证警示与 production 配置收窄，不能重复报成隐藏承诺。
- 增加实际缓存宿主时，首版库名超过 VFS 限制、误用 repository 注册 API、两 RxDB 共享 User 构造归属、全局 QueryCache 作用到系统表，都属于取证设计错误，已改为单宿主/短名称/instance User override/正确 entityManager 入口，不登记产品缺陷。中间日志全部保留，但不计入最终五条产品失败。
- 首版清理把 raw + encoded ID 合在 100-row URL，自己的清理也溢出；改成 25-row 清理。仅恢复本轮 review-large-rest-* 标签数据，[实际清理前后记录](evidence/2026-10-05/supabase/test-fixture-recovery.json)；不清用户数据。最终测试 finally 校验自身行归零。
- 临时 config 放 /tmp 时标准 types 无法解析，随后新 spec 配置漏列 wasm helper。均为取证脚本问题，不是新增 TypeScript 产品意见；最终配置放原 spec 旁并包含实际 helper。旧失败日志保留。
- remote E2E/基线含 Realtime CHANNEL_ERROR/重连告警；2 条 remote 通过证明实际 REST/RPC/第二 context 拉取，不证明 WebSocket handshake 或重订阅成功。

## 4. 对象级进展与继续项

六对象各自的计划、执行记录已增量更新。Supabase C2/C3/C5、sqlite-core C3、wa-sqlite C1/C4、QueryCache C1/C2/C5，以及应用/E2E 配置和动态场景均为部分执行。没有把 6 条 UI 用例算成全部应用深审。

后续仍需：已认证帐号/RLS/RPC 安全与失败边界，Realtime 真连接/重连，更多关系和 namespace 缓存读写，跨后端 conformance/四项覆盖率，OPFS/多标签写入/崩溃恢复与独立 pack consumer。remote E2E 失败时 cleanup/最后一次删除的远端确认也需加强；本批不凭“发了请求”宣称删除确认与资源隔离专题完成。

## 5. 基线、并发用户变更与交付

[源码/复验指纹](evidence/2026-10-05/supabase/runtime-and-sources.json) 分开保存最初测量 HEAD、交付 HEAD 与工作树输入。用户/外部在过程中暂存部分证据和早期 spec，并修改 graph/PGlite/encrypted 实现；助手没有 git add、commit、unstage、reset 或 stash，未修改这些业务文件。暂存版本可能不是最终工作树复验版本。

历史加密评审在本次续评开头已按当时未变输入收尾；随后观察到用户/外部 keyring 修改，不把过去的红结果冒充当前修复后的状态。本批最终输入与链接/格式校验见 [交付校验](evidence/2026-10-05/supabase/delivery-validation.json)，文档中“未改业务”指助手写范围，不表示用户工作树从未变化。
