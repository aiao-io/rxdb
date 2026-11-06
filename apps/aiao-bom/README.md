# Aiao BOM

面向制造工程师的本地 BOM 工作台：用同一份物料数据完成结构展开、备料、成本、变更核对和实例追溯。当前以 SC-100 滑板车及联产样本验收，运行在 Angular 浏览器应用中。

```bash
pnpm nx serve aiao-bom
pnpm nx run aiao-bom:requirements-check
pnpm nx run aiao-bom:requirements-test
pnpm nx run-many --projects=aiao-bom,aiao-bom-e2e --targets=lint,typecheck,spec-typecheck,test,build,e2e --parallel=1 --skipRemoteCache --output-style=static
```

开发端口 `4311`；生产产物 `dist/apps/aiao-bom/browser`。E2E 使用独立浏览器环境，由 `aiao-bom-e2e` 构建并静态服务生产产物。

| 目录                                    | 职责                                                             |
| --------------------------------------- | ---------------------------------------------------------------- |
| `src/app/pages/`                        | 概览、生产改版核对、展开、时间轴、双图映射、成本、反查和实例追溯 |
| `src/app/components/`                   | 共享交互、结果展示与业务操作面板                                 |
| `src/app/presentation/`                 | 十进制格式、发生项路径树、结果快照和改版比较                     |
| `src/app/bom-demo.service.ts`           | 应用接线、事务、持久化工作区及样本装载                           |
| `scripts/`                              | 应用需求结构门禁与门禁回归测试                                   |
| [requirements/](requirements/README.md) | 应用产品需求、决策、能力边界及验收账本                           |
| [../aiao-bom-e2e/](../aiao-bom-e2e/)    | 真实浏览器业务回归                                               |

数量、成本、生效期、ECN、实例与导入语义来自 `packages/rxdb-plugin-bom*`。应用使用 `BOM-*` 独立管理产品需求，平台能力引用写在 story 的 `capabilities` 中。

浏览器继续使用原有持久化库标识 `dev-rxdb-bom`。项目名称与目录迁移不改变数据库身份；显式重置仍会清空当前工作区。首次成功载入后的部分计算支持离线，整站冷启动与离线刷新尚未承诺，详见[能力矩阵](requirements/capability-matrix.md)。
