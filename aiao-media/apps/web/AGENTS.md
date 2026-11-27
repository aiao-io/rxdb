# Aiao Media

- Aiao Media 用户端 Angular 应用；用户端代码、数据层、部署和本地服务在本目录，产品需求位于上级 `aiao-media/requirements/`，E2E 位于同级 `web-e2e`。
- src/local-data 是 web 私有文件夹；跨应用协议统一从 `@aiao-media/api-contracts` 引用。
- 当前 MVP 行为、四路由、存储 key、数据库与 OPFS 标识保持兼容；迁移不删除用户数据。
- 需求真相源为 `aiao-media/requirements/stories` 的 MEDIA-US-* YAML；仓库根 `requirements` 是平台／领域需求，两者分别统计。
- 底层能力 Done 不代表应用接线或验收完成。
- 运行任务用 pnpm nx run aiao-media:<target>；真实账号套件和常规浏览器套件顺序运行。
- 三框架对称约束适用于共享能力；本应用保持 Angular 实现。
- 不提交 API Key、账号会话、本地 .env 或生成的 Kong 配置。
