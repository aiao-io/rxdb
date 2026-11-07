# Aiao Media

- 实际 Angular 产品，所有应用专属代码、契约、数据层、需求、部署、本地服务和脚本在本目录；e2e 位于同级 aiao-media-e2e。
- src/contracts、src/local-data 是普通文件夹，共用应用配置，不创建独立包或 Nx 项目。
- 当前 MVP 行为、四路由、存储 key、数据库与 OPFS 标识保持兼容；迁移不删除用户数据。
- 需求真相源为 requirements/stories 的 MEDIA-US-* YAML；根 requirements 是平台／领域需求，两者分别统计。
- 底层能力 Done 不代表应用接线或验收完成。
- 运行任务用 pnpm nx run aiao-media:<target>；真实账号套件和常规浏览器套件顺序运行。
- 三框架对称约束适用于共享能力；本应用保持 Angular 实现。
- 不提交 API Key、账号会话、本地 .env 或生成的 Kong 配置。
