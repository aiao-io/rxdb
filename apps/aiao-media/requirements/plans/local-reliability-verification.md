# 本地可靠性验收

本记录覆盖生产静态应用在桌面 Chrome 中的本机恢复和故障边界。使用真实 RxDB `0.0.26`、wa-sqlite/IndexedDB、OPFS 与 Service Worker；图片供应商为 fixture。正式 origin、真实模型和桌面系统 IME 仍须另验；移动真机暂缓，当前范围见[决策清单](../decisions.md)。

## 实现

- 供应商可独立移除 Key，保留非敏感配置；记住/替换/移除使用独立凭据记录，生成前重新检查 Key。配置读取、调用和备份共用字段白名单及 URL/模型校验。
- 作品的“生成信息”从已校验原图读取 MIME、实际尺寸、字节数和 SHA-256，展示模型与本机保存时间。复用提示词只编辑草稿；任务的“已保存”以当前实际可读文件为准，已删除或缺失时显示本机无副本。
- 备份拒绝无效版本、超限、重复任务/图片 ID、坏摘要、非法模型与无效 PNG；先完成全部校验，再写隔离暂存区。中断重试复用该备份的暂存区；暂存 ID 不得指向当前或保留的原工作区。
- `LocalMediaStore` 在同一个工作区 Web Lock 内打开数据库、读取 revision、写入及恢复 journal。`freshRows()` 对 adapter 选出的 row ID 强制刷新实体，避免普通 `find()` 复用身份缓存导致跨标签 CAS 读到旧 revision。
- 模板替换或显式接受外部草稿时重建编辑器状态，清空原撤销历史；普通自身保存回执保留编辑器。示例图片失败显示明确提示，正文/参数仍可用；编辑器脚本加载失败阻止提交，重试可恢复输入。
- 按工作区记录 `aiao-local-schema-<UUID>` 数据兼容版本；无 marker 的现有 v1 工作区原地建立 v1 marker，不清理/合并其他命名空间。打开数据库前及每次受锁保护的操作前检查版本；遇到未知/损坏/更高版本阻止访问，不降低 marker 或清空数据。

## 复验

```sh
pnpm install --frozen-lockfile
pnpm nx run-many -t lint typecheck test -p aiao-media aiao-media-e2e
pnpm nx run aiao-media-e2e:local-first-e2e
pnpm nx run-many -t relay-test auth-config-test deploy-check -p aiao-media
pnpm nx run aiao-media:supabase-test
pnpm nx run aiao-media:supabase-e2e
pnpm nx run aiao-media:requirements-check
```

浏览器新增场景位于 [local-reliability.spec.ts](../../../aiao-media-e2e/src/local-reliability.spec.ts)，原有本机和账号 fixture 场景继续运行。27/27 浏览器场景通过（11 项本机图片、12 项可靠性、4 项账号 fixture）；类型、lint、单元测试、relay/auth-config 检查和 release/deploy dry-run 通过。相关 story 的 AC 已逐项回写；精确结果见[验收总表](../verification-report.md)。

真实本地 Supabase 的 Auth、开发探针表 RLS、Realtime 与刷新/退出检查通过，3 项真实账号浏览器场景通过。测试服务已停止，数据卷和本地私有配置保留用于复验；没有启用产品数据复制。

## 回退边界

兼容性保护适用于包含该检查的版本；**不得回退到不认识 marker 的旧应用产物**。服务器回退不降级客户端 schema，也不清空 IndexedDB、OPFS 或工作区 bootstrap。未来不兼容迁移必须在相同工作区锁内先提高 marker，再修改数据；不能用移除 marker 作为迁移或修复手段。

自动化的更高版本 marker 测试验证当前守卫及已有标签页停止写入；没有执行尚不存在的未来 schema 转换，也不证明任意历史账号库均可迁移。正式部署的 Service Worker 更新/版本回退仍归 MEDIA-US-004 AC 3、4 验收。

## 代码入口

- [本机数据库与文件 journal](../../src/local-data/browser-media.ts)
- [供应商校验与调用](../../src/app/local-provider.ts)
- [备份校验](../../src/app/local-backup.ts)
- [界面行为](../../src/app/local-image-mvp.ts)及[模板](../../src/app/local-image-mvp.html)
- [草稿会话](../../src/app/prompts/studio-draft-session.ts)与[编辑器资源](../../src/app/prompts/prompt-assets.ts)
