# @aiao/rxdb-model

框架无关的 RxDB 实体模型核心库：从实体元数据（`EntityMetadata`）派生表单、详情页、可编辑表格与可视化查询构建器所需的全部纯逻辑，并配套 VTable 表格运行时基础设施。

## 定位与边界

- **唯一输入源**：`@aiao/rxdb` 的实体装饰器体系产出的 `EntityMetadata`。
- **框架无关**：本包不含任何 Angular / React / Vue 依赖，可被任意前端技术栈消费；三框架 UI 组件层见 `@aiao/rxdb-model-angular`（React / Vue 版本陆续提供）。
- **与 `@aiao/rxdb` 的边界**：核心包的 `entity-field.utils`（Field Descriptor 字段语义元数据）与 `entity-value.utils`（`parseEntityFieldValue`/`formatEntityFieldValue`/`validateFieldValue` 等）服务于核心内部与插件契约；本包的同名模块面向「实体管理界面」场景（表单字段提取、字段值解析/格式化/校验、表格列构建），语义不同、请勿混用。
- **表格引擎**：`@visactor/vtable` 与 `@visactor/vtable-editors` 为 peer 依赖（`~1.26.x`），由消费方提供。

## 模块一览

| 目录                                                                    | 职责                                                                                                   |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| 根目录 `entity-field.utils` / `entity-value.utils` / `structural-equal` | 字段配置提取、字段值解析/格式化/校验、键序无关的结构化深比较                                           |
| `entity-form/`                                                          | 元数据 → 表单字段配置（create/edit/view 三模式）、实体与表单数据双向转换（仅变化字段）、表单校验       |
| `entity-detail/`                                                        | 元数据 → 详情页 Tab 结构（基础表单 + 每关系一个表格 Tab）                                              |
| `entity-table/`                                                         | 可编辑表格列构建、15 个 VTable 单元格编辑器、剪贴板 / 键盘 / 主题 / tooltip / 拖拽重排等运行时基础设施 |
| `query-builder/`                                                        | 可视化查询构建器引擎：状态服务、操作符注册表、查询转换、schema 解析、即时校验、字段树等工具            |

## 使用

```ts
import { buildFormFields, buildEditableColumns, buildDetailTabs } from '@aiao/rxdb-model';

const fields = buildFormFields(metadata, 'create');
const columns = buildEditableColumns(metadata);
const tabs = buildDetailTabs(metadata);
```

查询构建器（框架无关服务层）：

```ts
import { createQueryBuilderService } from '@aiao/rxdb-model';

const qb = createQueryBuilderService<MyEntity>({ schema: { fields } });
qb.state$.subscribe(state => console.log(state));
qb.addRule({ field: 'title', operator: 'contains', value: 'a' });
const rxdbQuery = qb.toRxDBQuery();
```

## 开发

```bash
pnpm nx test rxdb-model        # Vitest（node 默认环境，DOM 用例经文件头 pragma 切 happy-dom）
pnpm nx build rxdb-model       # Vite 库构建（ES 单格式 + dts）
```
