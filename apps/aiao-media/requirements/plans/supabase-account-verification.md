# Supabase 账号与真实本地服务验收

## 运行入口

需要 Docker、Bun、Node.js 和 Chrome；所有服务仅监听本机回环地址。端口和随机开发凭据保存在忽略的 `infra/supabase/.env`，初始化保留既有配置。

```sh
# 真实 Auth / 邮件确认、开发探针表 RLS、Realtime 和刷新凭据撤销
pnpm nx run aiao-media:supabase-test

# 自动启动、迁移、构建，再用 Chrome 验证真实账号界面
pnpm nx run aiao-media:supabase-e2e
# 等价的浏览器入口
pnpm nx run aiao-media-e2e:supabase-e2e

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

| 故事 / AC             | 证据                                          | 可关闭的范围                                        |
| --------------------- | --------------------------------------------- | --------------------------------------------------- |
| MEDIA-US-201 AC 1     | `supabase-auth.spec.ts` 的未配置场景          | 未配置账号时四页不建立远程连接                      |
| MEDIA-US-201 AC 2     | 真实浏览器场景 1、3；真实服务探针刷新与退出段 | 会话注册/恢复/退出、刷新凭据撤销及本机数据保留      |
| MEDIA-US-201 AC 6     | 真实浏览器场景 2；fixture 与会话单测          | 鉴权错误/断网可见、本机创作继续、恢复前不显示已登录 |
| MEDIA-US-201 AC 3/4/5 | 尚无产品范围证据                              | 产品 RLS、工作区绑定、在途复制与切账号隔离待实现    |
| MEDIA-US-302 AC 1–6   | 尚无产品复制证据                              | adapter/plugin 接线、双设备冲突/删除/检查点等待实现 |

## 上游依赖核对

同级 `aiao-rxdb` 的 `packages/rxdb-adapter-supabase/src/RxDBAdapterSupabase.ts` 已包含 `pullChanges()` 与 `mergeChanges()`；`repository-sync.spec.ts` 包含真实 wa-sqlite/Supabase 集成场景。上游工作区版本为 `0.0.28`，本仓锁定的本机包为 `0.0.26`，尚未消费 Supabase adapter 或 sync plugin。

本记录只确认上游源码与测试存在。接线前仍需确认可用发布版本、配套插件、会话传递、产品 RLS、冲突双方内容保留、tombstone 与检查点恢复语义；不能把上游故事 Done 或开发探针授权换算成产品同步已交付。

## 部署与产品边界

本地 Auth 测试通过不关闭正式部署项目的 URL/CORS、邮箱投递和会话验收。登录只建立账号会话，界面明确提示跨设备同步尚未开放；工作区未自动绑定账号，草稿/供应商/作品不自动上传。首阶段复制固定排除供应商 Key、原图和本地文件标识。

桌面图片正式 origin、账号绑定与后台/同步扩展顺序见[路线图](../roadmap.md)；当前已验证基线见[验收记录](../verification-report.md)。
