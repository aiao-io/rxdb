# Aiao Pool（文件池）

- 实际 Angular 产品（项目名 `dev-rxdb-p2p`，v1 交付时更名 aiao-pool，域名 pool.aiao.io）。所有应用专属代码、契约、数据层、需求、部署、本地服务和脚本在本目录；e2e 位于同级 dev-rxdb-p2p-e2e。
- src/、server/、supabase/、shared/ 是普通文件夹，共用应用配置，不创建独立包或 Nx 项目；跨应用复用的协议层在 packages/rxdb-plugin-p2p。
- 需求真相源为 requirements/stories 的 POOL-US-* YAML；根 requirements 是平台/领域需求（本产品技术底座的 US-704～US-713 也在那里），两者分别统计，底层能力 Done 不代表应用接线或验收完成。
- 产品决策（D-01～D-08）与里程碑在 requirements/decisions.md 与 requirements/roadmap.md；改范围前先查决策，决策变更走「决策记录 + 对应故事」两处同步。
- 运行任务用 pnpm nx run dev-rxdb-p2p:<target>；真实账号套件与常规浏览器套件顺序运行。
- 三框架对称约束适用于共享能力；本应用保持 Angular 实现。
- 不提交 API Key、账号会话、本地 .env、Supabase 管理凭据或生成的 Kong 配置。
- 线上正式环境为 aiao-rxdb-p2p.aiao.workers.dev（v1 交付时切 pool.aiao.io）；发布配方、回滚点与线上验收证据见 requirements/verification-report.md。
