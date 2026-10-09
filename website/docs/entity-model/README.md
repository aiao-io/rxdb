# 实体模型（rxdb-model）

`@aiao/rxdb-model` 系列是**元数据驱动的实体管理 UI 工具链**：定义一次实体元数据，即可派生表单字段、详情 Tab 结构、可编辑表格列与查询条件树，并得到字段值的解析、格式化与校验能力。核心库零框架依赖，Angular / React / Vue 三端组件集 API 对称（命名、行为与状态语义功能等价）。

## 包结构

| 包                         | 说明                                                                                                          |
| -------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `@aiao/rxdb-model`         | 框架无关核心：字段值工具、表单 / 详情 / 表格列构建、查询构建器引擎                                            |
| `@aiao/rxdb-model-angular` | Angular 组件：EntityDetail / EntityDialog / EntityForm / EntityList / EntityTable / QueryTable / QueryBuilder |
| `@aiao/rxdb-model-react`   | React 组件（同名组件集）                                                                                      |
| `@aiao/rxdb-model-vue`     | Vue 3 组件（同名组件集）                                                                                      |

## 安装

```bash npm2yarn
# 核心库（必须）
npm install @aiao/rxdb @aiao/rxdb-model

# 按框架选其一
npm install @aiao/rxdb-model-angular
npm install @aiao/rxdb-model-react
npm install @aiao/rxdb-model-vue
```

组件样式由消费方的样式管线生成（约定 Tailwind + daisyUI 类名），组件包不发布编译样式；接入步骤见[样式接入](styling.md)。

## 核心概念

### 实体元数据

实体元数据是全部派生能力的**唯一输入源**：类型化属性、计算属性、校验规则与关系定义，来自 `@aiao/rxdb` 的 `@Entity` 装饰器（详见[模型定义](../model-definition/README.md)）。运行时经 `getEntityMetadata(cls)` 读取：

```typescript
import { getEntityMetadata } from '@aiao/rxdb';
import { Todo } from './entities/Todo';

const meta = getEntityMetadata(Todo);
// meta.namespace / meta.name / meta.propertyMap / meta.foreignKeyRelationMap / meta.permissions …
```

### Repository

Repository 是实体的数据访问门面，由客户端生成器为每个实体类产出（`find` / `findAll` / `findByCursor` / `count` / `create` / `update` / `remove` 等，详见[模型查询](../model-query/README.md)）。`rxdb-model` 组件不直接持有 Repository —— 组件按 `namespace` + `name` 定位实体类，查询、写入、撤销/重做全部走实体类的 Repository 路径，因此消费方只需保证数据库已初始化（Angular 注入 `RxDB`、React `useRxDB()`、Vue `injectRxDB()`）。

### 查询构建器

查询构建器把结构化查询条件（规则、AND/OR 分组、嵌套）可视化，并与仓库查询格式双向转换。同一套条件树在三个场景里流转：

- `EntityList` 的筛选弹层内嵌 QueryBuilder，实时改条件、应用后按条件重查；
- 独立使用 `QueryBuilder` 组件（可回填既有查询、可注入主题）；
- 核心层的 `QueryBuilderService` / `QueryConverter` 可以脱离 UI 单独使用。

## 能力面

| 组件           | 能力                                                                                                                    |
| -------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `EntityList`   | 无限滚动可编辑表格、行内编辑批量合并落库、撤销/重做、筛选弹层、级联新增、多对多选择模式、列头排序、手动排序实体的行拖放 |
| `EntityDetail` | Tab 式详情：基础表单区块 + 每个一对多/多对多关系一个表格区块；create 模式草稿先在内存中生成，保存时才落库               |
| `EntityForm`   | 元数据驱动表单，create / edit / view 三种模式；布尔、枚举、日期、数组、JSON、键值、关系等字段类型对应输入控件           |
| `EntityDialog` | 对话框外壳：标题栏拖拽、八向缩放、全屏                                                                                  |
| `QueryTable`   | 带筛选状态栏与计数徽标的表格；`EntityList` 的表格主体即它                                                               |
| `QueryBuilder` | AND/OR 分组、规则增删、拖拽重排、字段/操作符/值选择器、子查询、嵌套深度限制、主题注入                                   |

三端能力面一致（仓库宪法要求，单端缺失视为未完成）；跨框架一致性由三端演示应用的对拍 e2e 锁定（同一份 Todo 种子数据 → 同一份语义快照，见 `apps/e2e-parity/`）。

## 页面

- [框架无关核心](core.md)
- [Angular 用法](angular.md)
- [React 用法](react.md)
- [Vue 用法](vue.md)
- [样式接入](styling.md)
- [迁移说明](migration.md)
