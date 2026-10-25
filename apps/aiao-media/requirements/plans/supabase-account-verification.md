# Supabase 账号与真实本地服务验收

当前账号/工作区绑定、产品 RLS、原生 DTO 复制与后台已完成真实本地验收；本记录区分 Auth/开发探针与产品证据。本轮 Supabase 仅本地，生产账号/后台未部署；当前逐层结果见[本地产品交付验收](local-delivery-verification.md)与[正式交付记录的本地复验](public-delivery-verification.md)。

## 运行入口

需要 Docker、pnpm、Node.js 26+ 和 Chrome/Chromium；所有服务仅监听本机回环地址。端口与开发凭据保存在忽略的 `infra/supabase/.env`，初始化保留既有配置；命令使用 `NX_NO_CLOUD=true NX_LOAD_DOT_ENV_FILES=false`，防止应用私有 `.env` 的公网配置影响本地复验。

```sh
# 真实 Auth / 邮件确认、开发探针表 RLS、Realtime 和刷新凭据撤销
NX_NO_CLOUD=true NX_LOAD_DOT_ENV_FILES=false pnpm nx run aiao-media:supabase-test --skipRemoteCache

# 自动启动、迁移、构建，再用 Chrome 验证真实账号界面
NX_NO_CLOUD=true NX_LOAD_DOT_ENV_FILES=false pnpm nx run aiao-media:supabase-e2e --skipRemoteCache
# 等价的浏览器入口
NX_NO_CLOUD=true NX_LOAD_DOT_ENV_FILES=false pnpm nx run aiao-media-e2e:supabase-e2e --skipRemoteCache

# 开发调试
pnpm nx run aiao-media:supabase-serve
# 停止服务并保留数据库卷
pnpm nx run aiao-media:supabase-down
```

浏览器验收使用 `http://127.0.0.1:4399` 的生产静态应用和真实本地 Supabase API。Playwright 启动脚本先读取本机配置，只将 URL 和公开 anon Key 传入构建，随后启动本地 Worker。静态 CSP 仅为明确配置的 HTTP 回环 origin 增加精确连接许可；默认和 HTTPS 配置沿用既有策略。

账号套件阻止 Service Worker，专门验证 Auth 网络和 UI；真实 Service Worker 安装、离线冷启动由 `aiao-media-e2e:local-first-e2e` 验证。两套浏览器测试会分别构建默认与本地 Auth 配置，按顺序运行。

## 已验证能力

[`supabase-local.spec.mts`](../../../aiao-media-e2e/src/supabase-local.spec.mts) 的 3 项场景使用真实响应：

1. UI 注册、收取本地邮件并确认、确认前登录被拒绝、登录成功、刷新恢复及退出保留本机草稿和工作区。
2. 错误密码的准确提示和密码输入清空；只阻断 Auth 网络后显示待验证，本机编辑仍可保存，网络恢复后可重新验证。
3. 两标签页退出同步生效；导出备份不含访问/刷新令牌、邮箱、密码或管理 Key，账号操作不上传本机业务数据。

[`test-supabase-local.mjs`](../../scripts/test-supabase-local.mjs) 验证真实邮箱确认、服务端会话、开发探针表的跨账号读/改/删及 owner 伪造拒绝、Realtime 事件隔离、会话刷新和退出后刷新凭据撤销。Realtime 检查等待 PostgreSQL 订阅就绪，逐条校验事件 owner，并等待本次写入的目标事件。

临时账号使用随机邮箱，测试结束仅删除本次创建的账号和邮箱。service role 只供 Node 进程创建/清理测试账号，不传入页面、公开配置或备份。

## 逐条 AC 证据

| 故事 / AC             | 证据                                              | 可关闭的范围                                               |
| --------------------- | ------------------------------------------------- | ---------------------------------------------------------- |
| MEDIA-US-201 AC 1     | `supabase-auth.spec.ts` 的未配置场景              | 未配置账号时四页不建立远程连接                             |
| MEDIA-US-201 AC 2     | 真实浏览器场景 1、3；真实服务探针刷新与退出段     | 会话注册/恢复/退出、刷新凭据撤销及本机数据保留             |
| MEDIA-US-201 AC 6     | 真实浏览器场景 2；fixture 与会话单测              | 鉴权错误/断网可见、本机创作继续、恢复前不显示已登录        |
| MEDIA-US-201 AC 3/4/5 | `product-test` / `product-e2e` 的真实本地产品证据 | 产品 RLS、首次确认、独立副本、切账号与迟到结果隔离         |
| MEDIA-US-302 AC 1–7   | 原生复制接线、7 项真实产品浏览器场景与 API 套件   | 双副本/离线/冲突/删除/无原图提示、显式重扫与未启用时不上传 |

## 当前产品接线

产品使用本仓 `0.0.28` 的 Supabase adapter、history 与 sync 插件，独立 DTO 库接线见[product-sync-store](../../src/local-data/product-sync-store.ts)。私有图片/凭据仍留在原本机库，只有草稿、公开供应商配置和作品元数据进入确认后的复制范围。

真实本地产品证据已覆盖会话传递、产品 RLS、双方冲突保留、tombstone 与检查点重扫，见[交付记录](local-delivery-verification.md)。开发探针和依赖库测试仍只代表各自层，不替代产品场景；本次新增作品检索的 AC 也不复用这些通过标记。

## 部署与产品边界

登录只建立会话，不自动绑定或上传；用户明确确认后才启用独立副本复制。Key、原图与本地文件标识固定排除。生产项目 URL/CORS、邮件、管理员和部署属于后续启用条件，本轮仅本地，不要求生产配置。

当前基线与新增 [MEDIA-US-204 检索/预览任务](library-search-tasks.md)的边界见[验收记录](../verification-report.md)及[路线图](../roadmap.md)；既有已实现但未合并的故事保留 YAML 状态，204 的新 AC 另行验收。
