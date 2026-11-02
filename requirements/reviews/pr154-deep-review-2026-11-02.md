---
id: PR-154-DEEP-REVIEW
title: PR #154 Aiao Media incubation 深度评审
status: Open
created: 2026-11-02
updated: 2026-11-02
pr: https://github.com/aiao-io/rxdb/pull/154
---

# Review：PR #154 Aiao Media incubation 深度评审

## 评审对象与结论

- PR：https://github.com/aiao-io/rxdb/pull/154
- head：855ed7e5f1e0f2e45f180765897c11a8ff48cbdc（codex/aiao-media-incubation）
- base / merge-base：94e89be7dcd25575d2f9b5d560e1861fc645e78c（origin/main）
- 范围：373 个文件，约 57k 行；Aiao Media Angular 应用、Cloudflare Worker、Supabase 迁移、Tauri 宿主、脚本、E2E、需求与 CI。
- 本报告是整分支报告，不占 RV 编号。应用专属代码按 apps/aiao-media/AGENTS.md 评审；三框架对称铁律只适用于共享能力。本 PR 未改 packages/*，不存在公共包 API 的三端缺失。

结论：❌ 当前不能合并。图片同步的数据库提交路径必然失败；OAuth 身份引导存在可接管项目用户会话的高风险路径；自动初始化没有执行专用空项目守卫；断点续传和切换目标后的传输隔离没有实现。

## 🔴 P0：OAuth 自动身份引导可按任意邮箱签发项目用户会话

证据：apps/aiao-media/server/cloudflare/supabase-oauth.mjs:292-350。profile 读取失败时服务端接受请求体 email（294、297-298、329-330），用项目 service role 调 /auth/v1/admin/generate_link（336-343），随后直接 /auth/v1/verify（346-349），把 session 返回浏览器（352-357）。没有验证邮箱属于当前 OAuth 授权主体，也没有邮箱持有人确认。

触发：获得管理 OAuth 权限、但 profile 返回 401 的用户，在前端 prompt 输入其他用户邮箱；若该邮箱已有项目账号（或 magiclink 自动创建），服务端直接返回该账号 access/refresh token，攻击者可用受害者身份读写同步工作区。临时用 opaque 管理 token 和 different-user@example.com mock generate_link + verify 复现为 different-user-access。

根因：把管理主体到项目用户的映射降级成用户输入邮箱，并在后端绕过邮箱验证消费 admin magic link。Supabase 文档说明 generateLink 只生成链接且不会发送邮件；当前代码直接 verify，等价于服务端替用户完成验证。

修复：禁止客户端提供邮箱作为身份凭证；用管理主体不可伪造标识建立一次性、可审计的项目身份引导，或让真实项目用户完成显式登录/邮箱验证。映射绑定 management subject + project ref，重复初始化幂等且拒绝主体变更。补 profile 401、任意邮箱、同邮箱不同主体、重放和跨设备接管回归。
违反 MEDIA-US-304 的“不按邮箱合并/不把管理权限当项目用户权限”（故事第 36、46、67 行）。

## 🔴 P1：图片记录 pending → uploaded 提交被数据库触发器必然拒绝

证据：apps/aiao-media/src/local-data/image-sync.ts:64-83、144-175。首次 upsertRecord 发送 revision=1/baseRevision=0 的 pending；对象上传后再次发送同 identity 的 revision=2/baseRevision=1 POST upsert。010-image-storage.sql:41-64 的 INSERT 触发器要求 revision=1/baseRevision=0（52-54）；PostgreSQL 的 BEFORE INSERT 在 ON CONFLICT 决定 UPDATE 前执行，第二次 upsert 在插入检查阶段抛 Invalid initial file revision，不进入 UPDATE。

后果：文件可以进入 Storage 和 pending，但永远不能变成 uploaded；跨设备查询过滤 uploaded 后取不到图。临时 PGlite 复现同一 SQL 组合得到错误；现有 image-sync.spec.ts 只 mock REST 回执，没有真实触发器覆盖。

修复：pending 创建和最终提交使用明确 PATCH/UPDATE（id、baseRevision、revision），或保证冲突路由先进入 UPDATE；补真实 Postgres/PGlite 的 pending → uploaded、并发冲突和对象已存在幂等回归。

## 🔴 P1：自动初始化可写入已有业务项目，未执行专用空库守卫

证据：scripts/build-supabase-autoinit.mjs:3-14 复用 productionSources，只去掉事务边界，没有引入 build-production-supabase-bundle.mjs 的 emptyPublicGuard。initializeSupabaseProject 在 supabase-oauth.mjs:302-334 将 SQL 原样提交，读取 project ref 后没有 schema/version/object 冲突预检。

后果：共享项目点击初始化会执行 CREATE/ALTER/CREATE OR REPLACE、策略和触发器安装，可能覆盖同名函数/策略或改变权限，违反已有其他业务项目必须在首个写操作前拒绝。临时在 PGlite 放入 unrelated_business 表和同名 update_updated_at_column()，执行生成源后业务表仍在但同名函数被替换。

修复：自动接入使用带空库守卫、专用 schema/version marker 和对象冲突检查的独立 bundle；确认前只读检查，非白名单 public 对象、已有应用对象或更高版本直接拒绝。补共享项目无写入及专用空项目重复恢复回归。
违反 MEDIA-US-304 AC#5/6（故事第 44、65-66 行）。

## 🔴 P1：切换项目/账号后复用旧 ImageSyncController，原图可能写入旧目标

证据：local-image-mvp.ts:1414-1426 只要 this.imageSync 存在就直接返回，controller 固定旧 store/access/workspaceId。configureTarget（1444-1458）销毁旧 auth、暂停元数据同步并创建新 auth，却没有清空 imageSync；attachWorkspace 也没有清空。reconcileIdentity（1862-1869）只恢复新 key 的布尔开关，不重建 controller。

后果：A 项目启用图片同步后切换 B 项目/账号或本机工作区，保存新图时 syncSavedImage（1428-1435）仍用 A 的 token、workspace 和 store，造成跨项目写入、越权失败或泄漏。切换时在途上传没有代次/目标校验，迟到回执仍可写旧目标。

修复：目标、账号、profile、store 任一变化都递增图片传输 generation，取消/失效旧队列并清空 controller；上传任务携带 immutable target fingerprint，回执落库前核对 generation/target。补 A→B→A、退出、切工作区和在途回执隔离回归。
违反 MEDIA-US-305 AC#2/10（故事第 72、75 行）。

## 🟠 P1：没有持久传输队列，刷新/重开不会继续

证据：enableImageSync（local-image-mvp.ts:1257-1265）只在点击时遍历内存 history，之后仅把 scope 写 localStorage；自动上传只有 saveResult:834 的 syncSavedImage。image-sync.ts:113-141 对大于 6 MiB 的文件每次创建新 TUS session，location 只在局部变量，没有本地队列或 offset。

后果：分片中断、刷新/关闭或重开后，pending/needs_review 不会扫描恢复；同一文件从第 0 offset 新建上传，已传分片进度丢失。失败只能显示一次错误，无法满足持久队列、有限并发、断网/重开继续和会话过期只重传当前文件。

修复：建立按 target/workspace/source/version 唯一的本地传输队列，持久状态、offset、session URL、错误和 backoff；启动时扫描 pending/needs_review，按有界并发继续；停止旧目标使任务失效。补大图中断、刷新、TUS 过期、断网重试和多文件回归。
违反 MEDIA-US-305 In Scope 与 AC#5/6（故事第 35-37、75 行）。

## 🟠 P2：下载按 sourceId 取第一条记录，多个版本时可能取错

证据：image-sync.ts:91-100 获取 records(sourceId) 后过滤 uploaded 并取第一项；请求无 order，也没有按当前作品 sha256/version 绑定。数据库唯一键允许同一 sourceId 多个 version。

后果：PostgREST 顺序不保证，设备可能下载旧版本并保存到当前 task；摘要虽有效，内容却不是当前版本，破坏版本隔离。

修复：公开作品同步携带当前 file version/digest，下载按 workspaceId + sourceId + version 精确查询；无唯一当前关联时拒绝并显示冲突。补双版本乱序和迟到回执回归。

## 测试与验证

已执行（Node 26.12.0、NX_DAEMON=false NX_NO_CLOUD=true NX_LOAD_DOT_ENV_FILES=false，均经 Nx）：

- pnpm nx run aiao-media:test --args='--maxWorkers=1'：41 个文件、723 项通过。
- pnpm nx run aiao-media:platform-test：25 项通过。
- pnpm nx run aiao-media:script-test：31 项通过。
- pnpm nx run aiao-media:typecheck：失败；共享 checkout 的依赖 symlink 同时解析两份同版本 @supabase/supabase-js，product-sync-store.ts:227 报 TS2719。需在干净 workspace 安装后复跑，不能据此判定业务代码通过。
- 为验证问题曾添加临时 PGlite/Vitest probe，提交前已删除；工作树无临时测试文件。

## 三框架与治理

本 PR 是 apps/aiao-media 的 Angular 应用；应用 AGENTS 明确三框架约束只适用于共享能力。PR 未改 packages/* 或 Angular/React/Vue 公共 API，因此不误报单端缺失。候选领域 PR 仍须完成范围评审后合并；本 PR 没有公共包改动，但必须先修复上述 P0/P1 并完成真实 Supabase/Storage 验收。