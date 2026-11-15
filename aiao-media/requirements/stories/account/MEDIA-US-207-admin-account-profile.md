---
id: MEDIA-US-207
legacyId: aiao-media:US-207
product: aiao-media
title: 后台管理员账户资料与身份菜单
status: In Review
priority: High
epic: MEDIA-EPIC-003
created: 2026-11-15
updated: 2026-11-15
dependsOn: [MEDIA-US-201, MEDIA-US-203]
tags: [admin, account, profile, supabase, ux]
---

# 用户故事：后台管理员账户资料与身份菜单

## 作为/我想要/以便

**作为** 已登录 Aiao Media 管理后台的管理员

**我想要** 在顶部身份菜单中看到自己的名称，并通过下拉菜单进入账户详情页或退出登录

**以便** 快速确认当前身份、维护自己的基础资料，并安全结束后台会话

## 需求决策

本故事只处理**当前登录管理员自己的账户资料**。已有 [MEDIA-US-203](MEDIA-US-203-business-admin.md) 的跨用户用户列表继续负责账号访问控制、封禁、积分和运营数据；不把它改造成任意用户资料编辑器。

“用户名称”采用产品资料字段 `display_name`。已有账号没有资料时，界面按“邮箱 → 用户 UUID”顺序回退显示，升级期间不阻断登录；管理员保存名称后，顶部身份菜单和账户详情页立即使用新名称。

## 范围边界

### In Scope

- 顶部身份入口显示当前管理员的 `display_name`；资料为空时回退到邮箱，再回退到短 UUID，不能显示 `undefined` 或空白按钮。
- 身份入口使用可访问的下拉菜单，展示当前名称和邮箱，并提供“账户详情”和“退出登录”。菜单支持鼠标、键盘焦点、Enter/Space、Escape 关闭和直接跳转后的返回操作。
- 新增独立账户详情页和稳定路由（建议 `/account`），页面显示并区分可编辑字段与只读字段：名称、邮箱、用户 UUID、注册时间、最近登录时间、管理员状态和产品访问状态。
- 管理员可以修改自己的名称；名称经过长度、空白和 Unicode 文本校验，保存成功后返回已确认的服务端值，刷新页面或重新登录仍保持一致。
- 退出登录清除后台会话和本地会话材料，返回管理员登录入口；退出后直接调用管理 API 必须被服务端拒绝。
- 浏览器沿用 Supabase Auth SDK 管理当前账号的普通会话和公开配置；资料接口不返回密码、刷新令牌或服务端密钥，service role 与 Auth Admin 调用仅存在于 Edge Function。
- 资料修改使用服务端管理员授权、字段白名单和 revision/CAS；记录操作者、目标、前后资料版本、时间和结果，不记录密码、令牌或服务端密钥。
- 现有账号通过迁移或首次读取建立资料记录；迁移失败或资料缺失时仍能按既定回退规则登录和使用后台。

### Out of Scope

- 修改邮箱、密码、MFA、登录身份、身份提供商绑定、账号删除和邮件确认策略；这些是独立的 Auth 安全流程。
- 在本故事中编辑其他用户的名称、邮箱、密码或管理员资格；跨用户访问控制继续由 [MEDIA-US-203](MEDIA-US-203-business-admin.md) 管理。
- 头像上传、头像裁剪、个人文件、通知偏好、团队成员和细粒度角色权限。
- 直接在浏览器读写 `auth.users`、`raw_user_meta_data` 或 `raw_app_meta_data`；不使用前端伪造 metadata 获得管理员权限。

## Supabase 管理范围

| 对象 | 本故事允许的操作 | 入口与权限 | 不允许的做法 |
| --- | --- | --- | --- |
| `public.media_profiles`（新增） | 当前管理员读取、修改 `display_name` | 普通 JWT 调用受保护 RPC，从 `auth.uid()` 和实时管理员资格授权；资料表保留 RLS，浏览器无直接写权限 | 浏览器携带 service role；让用户修改角色或权限字段 |
| `auth.users` | 读取当前账号的邮箱、UUID、注册时间、最近登录时间 | 仅 Edge Function 的服务端 Auth 管理接口；响应只返回允许的字段 | 前端直接访问 Auth 管理接口；把密码或令牌写入资料表 |
| `public.media_accounts` | 读取当前产品访问状态 | 受保护 RPC 沿用 `media_admin_authorized()` | 账户资料页自行改变封禁状态 |
| `public.media_admin_memberships` | 展示当前管理员资格 | 沿用可信运维授权和服务端校验 | 自助提权、前端写入管理员资格 |
| `public.media_admin_audit` | 写入资料修改和会话相关管理结果 | 名称修改 RPC 在同一事务中写入审计 | 记录密码、token、service role key 或敏感响应 |

## 验收标准

| #   | 前置条件 | 操作 | 预期结果 | 状态 |
| --- | -------- | ---- | -------- | ---- |
| 1 | 管理员已有名称 | 登录并查看后台顶栏 | 顶栏身份入口显示名称，并同时保留可识别的邮箱；不显示 UUID 作为首选文案 | ✅ |
| 2 | 管理员没有名称或资料记录 | 登录并刷新后台 | 顶栏按邮箱、短 UUID 回退显示；页面可用，不出现空白、`undefined` 或阻断式错误 | ✅ |
| 3 | 管理员已登录 | 点击身份入口、使用键盘操作菜单 | 菜单显示名称、邮箱、“账户详情”和“退出登录”；Escape、失焦和跳转行为符合预期 | ✅ |
| 4 | 管理员已登录 | 直接访问 `/account` 或从菜单进入 | 打开独立账户详情页；名称可编辑，邮箱、UUID、注册时间、最近登录时间、管理员状态和产品访问状态只读 | ✅ |
| 5 | 名称为空、超长、仅空白或包含不允许控制字符 | 提交资料 | 前端和服务端都拒绝请求，显示可理解的错误，原名称不被覆盖 | ✅ |
| 6 | 名称有效且版本未变化 | 保存资料并重新读取 | 服务端返回已保存值；顶栏、详情页、刷新页面和重新登录后均显示同一名称 | ✅ |
| 7 | 资料版本已被其他请求修改或网络请求未确认 | 重复保存或重试 | 返回冲突/失败状态，不虚报成功；重新读取后由管理员决定是否再次保存 | ✅ |
| 8 | 点击“退出登录” | 退出当前后台 | 会话材料被清除并回到登录入口；随后直接请求 `/api/admin/session` 或其他管理接口返回未授权 | ✅ |
| 9 | 匿名、普通用户、伪造管理员 metadata 或无效会话 | 直接访问 `/account`、资料 API 或修改接口 | 服务端拒绝；浏览器产物不包含 service role key，伪造 metadata 不能获得管理员资格 | ✅ |
| 10 | 既有账号、资料缺失、迁移/资料 API 暂时失败 | 登录并使用后台 | 既有后台能力和回退名称继续可用；资料错误不会清空会话或本地产品数据 | ✅ |
| 11 | 资料修改成功 | 查询操作审计 | 审计包含操作者、目标、前后名称版本、时间和结果；不包含密码、访问令牌、刷新令牌或 service role key | ✅ |

## 交付阶段

| 阶段 | 交付 | 前置与边界 | AC |
| ---- | ---- | ---------- | -- |
| A | Supabase 资料模型、管理员资料 API、既有账号回退 | 不改变 Auth 登录契约；先完成权限、RLS、CAS 和审计 | 2、5、7、9、10、11 |
| B | 顶栏身份下拉菜单、退出登录、账户详情页 | 路由入口必须由 Worker 静态导航白名单和 Angular 路由同时覆盖 | 1、3、4、8 |
| C | 真实本地 Supabase 与浏览器验收 | 覆盖刷新、重新登录、撤权、并发冲突和资料 API 失败 | 1–11 |

## 技术笔记

Supabase Auth 的系统身份字段保留在 `auth.users`，产品可编辑资料放在与 `auth.users.id` 一对一关联的 `public.media_profiles`，避免把业务资料、管理员资格和 Auth 安全字段混在一起。`raw_app_meta_data` 只用于服务端维护的权限信息，不能作为名称编辑入口；`raw_user_meta_data` 也不作为本产品资料的唯一真相源。

按照 [MEDIA-US-208](MEDIA-US-208-supabase-admin-boundary.md) 的现行边界，普通资料通过 `media_admin_profile()` 和 `media_admin_update_profile()` 直连 Supabase。RPC 只信任 `auth.uid()`，检查实时管理员资格和产品访问状态；名称按 Unicode 码点计数，限制为去除首尾空白后的 1–40 个字符，拒绝控制字符、孤立代理和不可见方向控制符。更新使用 revision/CAS 与 request ID 幂等，资料和成功审计原子写入；发生冲突或未知网络结果时必须重新读取后才能保存。Auth 系统身份通过 `admin-api` 的 `account` 入口只返回当前操作者的邮箱、UUID 和两个时间字段。21 → 22 增量迁移为已有管理员补齐空资料，缺记录的账号仍按 revision 0 读取并在首次保存时创建。

首版只承诺名称资料。邮箱、密码、MFA 和身份提供商变更会触发确认、会话和安全策略，必须另立故事后再做，不能顺手塞进本页。

## 实现文件

- [后台根组件](../../../apps/admin/src/app/app.ts)、[后台模板](../../../apps/admin/src/app/app.html)、[后台样式](../../../apps/admin/src/app/app.css)
- [后台路由](../../../apps/admin/src/app/app.routes.ts)、[Worker 静态导航](../../../apps/api/src/local-first-worker.ts)
- [账户菜单](../../../apps/admin/src/app/admin-account-menu.ts)、[账户页](../../../apps/admin/src/app/admin-account.ts)、[资料状态](../../../apps/admin/src/app/admin-account-state.ts)
- [资料客户端](../../../apps/admin/src/app/product-client.ts)、[Supabase 资料迁移](../../../infra/supabase/migrations/022-admin-account-profile.sql)、[Auth 身份 Edge Function](../../../infra/supabase/functions/admin-api/index.ts)
- [管理员授权边界](../../../apps/api/src/product-http.ts)、[现有后台审计](../../../infra/supabase/migrations/002-product-workspaces.sql)

## 本地验收证据（2026-11-15）

- `aiao-media-admin:test` 128/128；账户新增模块的语句/分支/函数/行覆盖率为 98.83% / 96.49% / 100% / 100%，覆盖名称校验、身份菜单键盘和失焦、保存确认、异步迟到回执与资料接口失败。
- `aiao-media:production-bundle-test` 22/22，验证普通 JWT/RLS、匿名/普通用户/撤权/禁用拒绝、CAS、幂等审计及 21 → 22 升级和重放。
- `aiao-media-e2e:product-e2e --grep='后台账户：'` 使用真实本地 Supabase 验证保存、直接刷新、退出重登、多页面冲突、响应丢失后的重新读取，以及资料失败不清会话、撤权后拒绝保存。
- 账户 4 个场景与既有后台 P0 3 个场景合计 7/7；追加 WCAG 2 A/AA、2.1 AA 的账户页与展开菜单 Axe 检查为 0 违规，并覆盖 390px 小屏菜单与键盘 Space/方向键/Escape。
- 生产 Admin 构建、相关 lint/typecheck 和 `bundle-security` 通过；需求总校验仅余原有 4 处失效锚点。故事进入 In Review，尚未合并或部署。

## References

- [需求约定](../../CONVENTIONS.md)
- [跨用户业务后台管理](MEDIA-US-203-business-admin.md)
- [Supabase 账号与资源授权](MEDIA-US-201-sessions.md)
