# bom-workspace

BOM 领域页面、状态、业务服务与备份恢复模块，由 `aiao-bom` 的领域路由惰性加载。装配入口为 `domainRoutes(config)`；调用方必须显式提供数据库名称、概览与工作台路径和显示名称。

```bash
pnpm nx test bom-workspace
pnpm nx test bom-workspace --coverage
```

领域业务端到端回归位于 `apps/aiao-bom-e2e/src/domain/`。
