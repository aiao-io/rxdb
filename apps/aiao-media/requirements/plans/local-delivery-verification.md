# 本地产品交付验收

日期：2026-10-24。分支 `codex/aiao-media-incubation`，PR #154。本记录覆盖当前分支的本地实现；不代表正式域名、真实供应商或生产发布已验收。

## 产品接线

- 私有原图、供应商凭据和本机集合继续使用原数据库、profile key 和 OPFS 路径，保持 `SyncType.None`。全局本机注册表只存身份归属、选择和绑定回执，不存会话或 Key。
- 登录不绑定、不上传。用户确认后才持久化 pending 绑定、幂等创建/加入远程工作区。加入已有工作区时建立独立副本；退出保留当前本机内容，A/B 切换恢复各自副本。
- DTO 副本使用本仓 `@aiao/rxdb-adapter-supabase`、history 和 sync 插件。原生插件维护推拉、出站日志和检查点。产品额外保存已确认的业务 revision，供服务端 CAS 检查；连续离线编辑不会把尚未确认的 revision 当作服务端版本。
- 传输白名单固定为草稿、供应商公开配置和作品信息；稳定记录 UUID 按 workspace/kind/sourceId 派生。Key、原图、路径、句柄和可解引用的本机文件标识不传输。另一副本显示“本机无原图”，不提供下载。
- 冲突先持久化双方版本，再让原生拉取继续处理其它记录；有冲突的私有投影暂停。用户明确选择本机或同步端版本后才继续，归档副本不自动删除。删除使用 tombstone，不按时间选胜者、不部署 TTL。
- 草稿检查点等待在途保存，并验证当前输入已经持久化；保存失败/冲突阻止切换。账号变更立即停止旧复制，隐藏不匹配账号的内容；在途生成结束后仍保存到原副本，随后才切换。
- `/admin` 通过服务端验证 token 与实时成员资格，授权不采用 user_metadata。用户分页/详情、封禁/解禁、最后管理员保护、模板 CAS/发布/撤回、公共策略发布、任务筛选、分来源用量与审计均已接线。无客户端物理删号功能。
- 供应商策略先保存草稿，再发布到运行表。代理逐请求读取实际运行版本，限制目标/模型/画幅并返回版本；策略读取失败时不发送生成请求。应用直连提交前也校验当前策略。未发布的草稿不改变运行版本。
- 任务只在单独确认后进入持久上报队列。服务端按账号隔离、按稳定任务 ID 去重；应用上报不能伪造供应商或核验费用。缺少证据的用量/费用保留未知。
- 本机供应商、任务、notebook 和图片/音频/视频提交日志已有逐条实体与索引。原集合保留为兼容快照；新写入和索引在同一事务提交，旧构建改动在下次读取时按 revision 重新投影。损坏集合不以空集合替换。

## 单测与真实浏览器数据层

`aiao-media:coverage` 将 240 项单测与 15 项真实 Chromium 数据层测试一起执行。浏览器测试使用实际 RxDB、SQLite WASM、IndexedDB 和 OPFS，覆盖旧集合的事务迁移、CAS 回滚、全局注册表别名、提交日志/冲突重开、参考图在途保留、原图/WAV 幂等保存与精确回读、写入失败恢复、锁定撤销预览和 DTO 私有投影。

当前四项合并数据：statements 74.82%、branches 67.59%、functions 79.57%、lines 84.67%。不把单一行指标称为四项覆盖率通过；应用不属于可发布包覆盖率门禁范围。界面与原生 Supabase 复制仍由独立的真实产品 e2e 验证，不把它们折算进这份 Vitest 数字。

## 已通过的产品场景

`pnpm nx run aiao-media-e2e:product-e2e` 使用生产静态包、Chrome、两套独立浏览器存储和真实本地 Supabase，6 项通过：

1. 登录不绑定；取消首次确认不创建工作区、不上传、不改变本机副本。
2. 两独立副本草稿往返同步；退出保留副本；A→B→A 恢复各自内容。
3. 匿名/普通用户后台拒绝；管理员发布模板；发布不覆盖本机草稿；角色撤销后拒绝请求并清空后台数据。
4. 离线多次编辑、重开和推送；修改/修改、删除/修改保留双方；明确接受删除后重开不复活。
5. 供应商/作品信息跨副本可见，Key 和原图留在本机；未确认不上报任务，确认后上报不包含提示词/图片/凭据，未知用量保持未知。
6. A 的生成响应迟到时仅写入 A，B 看不到 A 的内容；回到 A 可读取原图。

`pnpm nx run aiao-media:product-test` 验证真实本地服务的匿名/A/B/管理员边界、所有权不可改、DTO 白名单、离线压缩 revision CAS、tombstone、幂等绑定、模板 CAS/发布/撤回、显式任务上报/来源限制、用户封禁/解禁、最后管理员保护与审计。

`aiao-media:script-test` 另含真实 Worker 处理函数与模拟上游的运行策略启停、模型/画幅拦截和版本响应验证；不会调用真实模型或据此宣称供应商兼容性已验证。

`pnpm nx run aiao-media-e2e:local-first-e2e` 的 28 项原有本机回归通过；`offline-update-e2e` 的实际离线 Worker 更新/回退专项通过。旧引擎升级与受阻回退后的恢复另由 `upgrade-e2e` 验证。

## 运维与兼容边界

本地管理员授权通过 `pnpm nx run aiao-media:admin-membership --user-id=<Auth UUID> --state=enabled` 执行。仅服务端可信运维凭据可调用对应 RPC；同样遵守 revision 和最后管理员保护。审计的全零操作者标识可信运维入口。命令只连接应用独立本地服务。

本地 Worker 私有配置自动写入忽略的 `deploy/.dev.vars`（0600），服务端 Key 不进入公开配置或浏览器构建。正式环境需由部署方设置 `MEDIA_SUPABASE_URL`、公开 `MEDIA_SUPABASE_ANON_KEY` 与服务端 secret `MEDIA_SUPABASE_SERVICE_ROLE_KEY`，本次不发布生产。

Supabase SDK 在锁文件去重到 2.117.3，无全局版本 override。同步副本使用 SDK 公共 CommonJS 构造入口，以匹配 adapter 声明的条件导出类型；Angular 仅为此依赖显式声明 CommonJS 支持。复制客户端独立于主 Auth SDK，凭据仅保存在其内存会话，不共享可变账号 client。

旧构建升级只验证 `upgrade-e2e` 指定的 0.0.26 基线。该旧引擎不能打开新版库；回退时拒绝打开、不改 profile，恢复当前构建后新版草稿与原图仍可读取。离线更新/回退专项使用真实生产 Worker、两套有独立完整性清单的静态壳，验证等待旧页面关闭、激活、离线读取与回退，期间本机草稿和原图保留。不承诺任意历史引擎降级。正式 Service Worker 更新/回退、正式域名、真实供应商、移动真机和真实系统中文 IME 保留各 story AC。D-06 的自动清理、保留天数和检查点过期仍未启用。

## 实现与测试

- [应用接线](../../src/app/local-image-mvp.ts)、[绑定控制器](../../src/app/product-workspace.ts)、[工作区会话](../../src/app/workspace-session.ts)
- [本机注册表](../../src/local-data/workspace-registry.ts)、[持久注册表](../../src/local-data/workspace-registry-store.ts)、[原生复制](../../src/local-data/product-sync-store.ts)
- [私有投影](../../src/local-data/product-projection.ts)、[集合迁移](../../src/local-data/local-collections.ts)、[产品 DTO](../../src/contracts/product-data.mjs)
- [后台界面](../../src/app/admin-console.ts)、[后台 API](../../deploy/admin-api.mjs)、[运行策略](../../deploy/product-content.mjs)
- [真实服务测试](../../scripts/test-product-local.mjs)、[真实产品浏览器测试](../../../aiao-media-e2e/src/product-local.spec.mts)
