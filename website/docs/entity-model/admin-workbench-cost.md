---
id: admin-workbench-cost
title: 接入成本记录：React Admin 应用模板
sidebar_label: 接入成本（admin-workbench-cost）
description: React Admin 应用模板（US-528）的源码基线、依赖、样式入口与待验证的实际接入成本
---

# 接入成本记录：React Admin 应用模板

接入载体为 [rxdb-admin-template-react](https://github.com/aiao-io/rxdb/tree/main/apps/rxdb-admin-template-react)。
模板当前在 Nx 工作区内孵化，提供默认资产场景、模型驱动页面、搜索、后台外壳和备份恢复。
应用范围与验收入口见其 [README](https://github.com/aiao-io/rxdb/blob/main/apps/rxdb-admin-template-react/README.md)。

本文列出现有模板的代码与工程基线。实际业务新增代码、开发者接入用时、仓外安装发布产物和试用者独立重搭均待验证，
对应 [US-528](https://github.com/aiao-io/rxdb/blob/main/requirements/stories/domain/US-528-admin-consumer-example.md) 的 AC#1～#3。

## 闭环范围与证据

[`ENTITIES`](https://github.com/aiao-io/rxdb/blob/main/apps/rxdb-admin-template-react/src/app/entities/asset-entities.ts)
注册资产分类、资产与维护记录。模型 UI 提供列表、详情、表单、校验和查询筛选，应用另外接线导航、全文搜索与备份恢复。
[`createWorkbenchDatabase`](https://github.com/aiao-io/rxdb/blob/main/apps/rxdb-admin-template-react/src/app/rxdb/setup_rxdb.ts)
使用 sqlite-wasm 主线程 IndexedDB，以满足当前搜索和备份组合。

仓库内浏览器闭环由 `rxdb-admin-template-react-e2e` 覆盖：

```bash
pnpm nx run rxdb-admin-template-react:build
pnpm nx run rxdb-admin-template-react-e2e:e2e --workers=2
```

这些命令通过 workspace 源码与本仓库依赖验证模板接线，不证明发布 tarball 能在仓库外安装运行。
当前应用批次不实施独立复制，也不以浏览器测试代替公开包消费验收。

## 当前依赖入口

直接依赖以模板 [package.json](https://github.com/aiao-io/rxdb/blob/main/apps/rxdb-admin-template-react/package.json) 为准：

| 包                                                            | 模板中的用途                           |
| ------------------------------------------------------------- | -------------------------------------- |
| `@aiao/rxdb`                                                  | 实体、元数据与数据库                   |
| `@aiao/rxdb-adapter-sqlite-wasm`                              | 当前本地持久化、搜索和备份使用的适配器 |
| `@aiao/rxdb-react`                                            | Provider 与响应式查询                  |
| `@aiao/rxdb-model-react`                                      | 模型驱动实体 UI                        |
| `@aiao/rxdb-admin` / `@aiao/rxdb-admin-react`                 | 后台外壳、布局与偏好                   |
| `@aiao/rxdb-plugin-history`                                   | 表单历史与撤销 / 重做                  |
| `@aiao/rxdb-plugin-search` / `@aiao/rxdb-plugin-search-react` | 全文搜索                               |
| `@aiao/rxdb-devtools`                                         | 开发模式的调试入口                     |
| `@aiao/rxdb-test`                                             | 当前仓库的 E2E 数据库隔离命名辅助      |
| `lucide-react` / `rxjs`                                       | 图标与响应式运行时                     |

样式开发依赖为 Tailwind、daisyUI 与 `@tailwindcss/vite`。React、React DOM、React Router、Vite、TypeScript
以及相关类型与工具由当前工作区配置提供。此清单记录仓内接线，不是经过仓外安装验证的完整独立工程依赖表。

## 源码基线

测量对象为模板现有 `src/`，排除 `*.spec.*` / `*.test.*`；包含空行和注释。当前基线为 **1,058 行**，
这不是新增业务代码量，也不能与一个最小 CRUD 页面直接相减推导收益。

| 文件                                  | 行数 |
| ------------------------------------- | ---- |
| `src/app/app-config.ts`               | 14   |
| `src/app/app.tsx`                     | 85   |
| `src/app/backup/backup-ops.ts`        | 87   |
| `src/app/entities/asset-entities.ts`  | 112  |
| `src/app/entities/entity-registry.ts` | 47   |
| `src/app/pages/backup-page.tsx`       | 193  |
| `src/app/pages/entity-list-page.tsx`  | 31   |
| `src/app/pages/entity-shell.tsx`      | 28   |
| `src/app/pages/search-page.tsx`       | 69   |
| `src/app/pages/start-page.tsx`        | 22   |
| `src/app/router.tsx`                  | 54   |
| `src/app/rxdb/setup_rxdb.ts`          | 55   |
| `src/app/shell/record-search.ts`      | 49   |
| `src/app/shell/workbench-menu.tsx`    | 65   |
| `src/app/shell/workbench-shell.ts`    | 87   |
| `src/main-root.ts`                    | 7    |
| `src/main.tsx`                        | 24   |
| `src/styles.css`                      | 29   |

在仓库根目录复验当前源码计数：

```bash
python3 - <<'PY'
from pathlib import Path

root = Path('apps/rxdb-admin-template-react')
total = 0
for source in sorted((root / 'src').rglob('*')):
    if not source.is_file() or '.spec.' in source.name or '.test.' in source.name:
        continue
    count = len(source.read_text().splitlines())
    total += count
    print(source.relative_to(root), count)
print('total', total)
PY
```

`app.config.json`、HTML、Vite 配置、测试、需求门禁和文档不在该 `src/` 口径内。
实际业务接入成本仍须在同一任务下记录修改文件、增量行数、依赖、配置步骤和耗时，才能关闭 AC#2。

## 样式入口

模板 [styles.css](https://github.com/aiao-io/rxdb/blob/main/apps/rxdb-admin-template-react/src/styles.css)
使用以下入口，再通过 daisyUI 插件声明可用主题：

```css
@import 'tailwindcss';
@import '@aiao/rxdb-model-react/tailwind.css';
@import '@aiao/rxdb-admin-react/tailwind.css';
@import '@aiao/rxdb-admin/admin.css';
```

Tailwind 必须扫描包内组件使用的工具类。模型组件的发布构建样式要求见
[`@aiao/rxdb-model-react` README](https://github.com/aiao-io/rxdb/blob/main/packages/rxdb-model-react/README.md)；
包内样式源和发布产物样式都需要在实际消费工程复验，不能仅凭当前 workspace 构建认定仓外资源完整。

## 未关闭的验收

- AC#1：隔离安装实际发布 tarball，确认依赖、样式与 WASM，并跑通录入、编辑、筛选与刷新重开。
- AC#2：为同一实际业务任务记录新增代码和接入工作；模板总代码清单只提供基线。
- AC#3：由试用者按文档独立重搭，记录步骤、问题、用时和减少的手工接线。

这些验收保留在 US-528，不随应用重命名或模板的本地回归通过而标记完成。
