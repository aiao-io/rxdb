# aiao-model-design

从 `aiao-enterprise` 直接迁入模型设计器，入口为 `/model-designer/canvas`。

## 原代码来源

- `packages/rxdb-model-designer/src` → `src/app/model-designer`，包含原画布、属性／关系／索引编辑器、代码与 SQL 预览、模型及版本管理、AI 会话和提案流程，以及原测试。
- `packages/rxdb-models/entities` → `entities`，生成文件位于 `src/app/model-designer/models`。
- `apps/dashboard/src/app/layout/ai-drawer` → `src/app/adapters` 中的 AI 抽屉组件和服务。
- `apps/dashboard/src/app/shared/services` → `src/app/adapters` 中的 HTTP 适配器。

适配范围为应用路由、DI、本地 SQLite 初始化、当前公共包 API、独立页面布局与测试模块解析。原设计器组件和交互流程保留。

## 运行

在仓库根目录执行：

```bash
pnpm nx serve aiao-model-design
```

迁移预览配置使用 4201 端口：

```bash
pnpm nx run aiao-model-design:serve:migration
```

本地模型、实体位置和 AI 会话保存在独立的 `aiao-model-design` SQLite 数据库中。首次运行从原模型列表创建模型。

## 原服务端接口

AI 生成／验证／对话、远程 SQL 和客户端包接口继续调用原服务端。开发代理默认指向 `http://localhost:3200`，可设置 `MODEL_DESIGN_API_URL` 指向部署了这些接口的服务：

```bash
MODEL_DESIGN_API_URL=http://localhost:3200 pnpm nx serve aiao-model-design
```

代理覆盖 `/api/**` 与 `/bff/**`，后端沿用原认证和权限。前端不保存 AI 服务商密钥；没有后端时，本地模型编辑仍可使用，服务端操作会显示接口错误。

## 验证与模型生成

```bash
pnpm nx test aiao-model-design
pnpm nx run aiao-model-design:typecheck
pnpm nx lint aiao-model-design --max-warnings=0
pnpm nx build aiao-model-design
pnpm nx run aiao-model-design:generate-models
```

迁入的 69 个测试文件共 738 条测试通过，包含真实 SQLite 级联删除与查询生命周期集成测试。迁入基线覆盖率为语句 61.75%、行 63.64%，尚未达到仓库 80% 门槛。生产构建仍有原依赖的 CommonJS 提示和初始包大小告警；构建成功不等于这些门槛已解决。
