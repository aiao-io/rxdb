# Aiao Media

- 本目录是 Aiao Media 产品根；`web`、`admin`、`api` 和 E2E 是同一产品的 Nx 项目。
- 产品需求唯一真相源为 `requirements/stories` 的 `MEDIA-US-*` YAML；仓库根 `requirements` 维护平台与可复用领域能力。
- 跨应用复用的领域模型和 API 契约进入 `packages/`，使用 `@aiao-media/*`；应用内部代码留在对应 `apps/*`。
- 产品应用与其私有包的改动在同一 PR 中统一评审、验证并合入。
- 当前迁移阶段保持用户端路由、存储 key、数据库与 OPFS 标识兼容，不删除用户数据。
- 不提交 API Key、账号会话、本地 `.env` 或生成的 Kong 配置。
