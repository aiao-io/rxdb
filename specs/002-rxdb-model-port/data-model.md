# Data Model: rxdb-model 实体模型库

**Feature**: `002-rxdb-model-port`

本文描述特性涉及的核心数据模型与状态机。技术实现细节（类名、函数签名）见 [contracts/](./contracts/)。

## 实体与关系

```
EntityMetadata（实体元数据，输入源）
 ├── 派生──→ FormFieldConfig（表单字段配置）
 ├── 派生──→ DetailTab（详情 Tab 结构：FormTab + 每关系 TableTab）
 ├── 派生──→ EditableColumnConfig（可编辑表格列配置）
 └── 派生──→ FieldMetadata → QueryRuleTree（查询条件树）
```

### EntityMetadata（实体元数据）

唯一输入源，由核心包 `@aiao/rxdb` 的实体装饰器体系产出。

- **属性**: 类型化属性表（propertyMap）、计算属性表（computedPropertyMap）、关系表（relationMap / foreignKeyRelationMap，含一对多/多对多/一对一关系、外键字段、目标实体）
- **派生规则**: 系统字段（id、创建/更新时间、创建/更新人）在任何派生场景中默认过滤；属性类型决定默认输入控件、单元格编辑器与可用操作符集
- **不变量**: 一个实体元数据必须可独立派生全部四种场景配置；派生过程纯函数化（同输入同输出）

### FormFieldConfig（表单字段配置）

- **字段**: 字段名、类型（属性类型 + 三种关系类型 + computed）、模式（create/edit/view）、可见性、校验规则、关系选项提供器（RelatedEntityProvider）
- **生命周期**: 由元数据构建（buildFormFields）→ 按模式过滤/排序 → 渲染输入控件 → 用户输入 → 解析（parse）→ 校验（validate，结构化错误）→ 提交（只产出变化字段）

### EditableColumnConfig（可编辑表格列配置）

- **字段**: 列定义（标题、宽度、类型）、单元格编辑器（按属性类型映射 15 种编辑器之一）、只读规则（记录级只读 → 编辑器降级为只读视图）、操作列/时间列
- **状态机（行级）**: `编辑中 →（批量合并）→ 待写入 → 一次写入`；只读行与草稿新建行在删除/拖拽重排上按规则禁止或降级

### QueryRuleTree（查询条件树）

- **字段**: 根组（QueryBuilderRuleGroup，带 id）、规则（field + operator + value）、嵌套组、AND/OR 组合子、最大嵌套深度
- **状态机**: 空树 → 首规则自动默认值（布尔=false、关系=exists）→ 增删规则/分组 → 移动/重排 → 双向转换（↔ 仓库查询格式 RuleGroup）→ 逐规则校验（合法/非法 + 结构化原因）
- **不变量**: 树的任何合法状态都可无损转换为仓库查询格式，且可从仓库查询格式回填（id 剥离/补发）；超过最大深度的操作被拒绝并提示；存在性（exists/notExists）规则可挂载子查询子树，子查询自身受限同一深度约束

### Entity UI Components（实体管理 UI 组件集）

- **组成**: 实体列表（无限滚动 + 行内编辑 + 撤销/重做 + 筛选）、实体详情（Tab 结构 + 草稿保存编排）、实体表单（模式驱动）、对话框外壳（拖拽/缩放/全屏）、查询表格（筛选状态栏 + 插槽）、可视化查询构建器（组件树 + 主题 token）
- **草稿实体生命周期**: create 模式 → 内存草稿实体（不落库）→ 校验 → 保存（一次性落库）；取消 → 丢弃无副作用
- **跨框架约束**: 三端组件在相同元数据与数据下渲染输出一致；公共 API 命名与行为对称；每端都有加载/空/错误三态与键盘可达性
