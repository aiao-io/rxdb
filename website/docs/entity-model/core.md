# 框架无关核心

`@aiao/rxdb-model` 是纯逻辑层，不依赖任何 UI 框架，可被任意前端技术栈消费。所有 UI 组件的渲染配置与校验都由这里的函数从实体元数据派生。

## 字段值工具

解析（原始输入 → 类型值）、格式化（类型值 → 展示字符串）与结构相等比较：

```typescript
import { parseEntityFieldValue, formatEntityFieldValue, structuralEqual } from '@aiao/rxdb-model';

// '2026-10-09' → ISO 字符串；'a,b' → ['a', 'b']；非法输入返回 null 而不抛异常
const parsed = parseEntityFieldValue('date', '2026-10-09');

// 原始输入 → 本地格式展示字符串；数组以逗号加空格连接；JSON 类值序列化为 JSON 字符串
const shown = formatEntityFieldValue('date', parsed);

// 键顺序无关、循环引用安全的深比较
structuralEqual({ a: 1, b: 2 }, { b: 2, a: 1 }); // true
```

## 表单：字段配置、双向转换与校验

```typescript
import {
  buildFormFields,
  createDefaultFormData,
  entityToFormData,
  formDataToEntityChanges,
  validateForm
} from '@aiao/rxdb-model';

const metadata = getEntityMetadata(Todo);

// 按模式生成字段列表：create 排除计算字段且不含系统字段；
// edit 追加只读系统字段（ID / 创建时间 / 更新时间 / 创建者 / 更新者）；view 全部字段只读
const createFields = buildFormFields(metadata, 'create');

// 按字段默认值生成表单数据（create 模式的初始形态；布尔默认 false，数组默认空数组，其余默认 null）
const formData = createDefaultFormData(createFields);

// 表单数据 → 实体变更：只产出实际变化的字段，未变化的字段不产生写入
const changes = formDataToEntityChanges(todo, formData, createFields);

// 提交校验：返回结构化结果（valid + 按字段的错误列表），绝不抛出未捕获异常
const result = validateForm(createFields, formData);
if (!result.valid) {
  console.error(result.errors); // [{ field, message }, …]
}
```

## 详情：Tab 结构

`buildDetailTabs` 生成一个基础表单区块，并为每个一对多/多对多关系生成一个表格区块：

```typescript
import { buildDetailTabs } from '@aiao/rxdb-model';

const tabs = buildDetailTabs(metadata);
// [{ key: 'basic', type: 'form', label: '基本信息' }, { key, type: 'table', relationName, … }, …]
```

## 表格：可编辑列配置

`buildEditableColumns` 按固定顺序产出列：ID 列 → 普通属性列（跳过 `id` / `createdAt` / `updatedAt` 与审计字段 `createdBy` / `updatedBy`）→ 计算属性列 → 外键关系列 → `createdAt` / `updatedAt` 系统时间列 → 操作列（查看 + 删除）：

```typescript
import { actionsColumn, buildEditableColumns, deriveEntityCapabilities } from '@aiao/rxdb-model';

const { canDelete } = deriveEntityCapabilities(metadata);
const columns = buildEditableColumns(metadata, {
  relatedItemsProviderFactory(fkField, relatedEntityName) {
    // 返回外键字段的候选实体 provider（关系列下拉数据源）
  }
});
```

每种属性类型对应合适的单元格编辑器（布尔开关、枚举下拉、日期、JSON、键值、关系选择等）；只读记录降级为无编辑能力。表格运行时能力（系统剪贴板复制/粘贴、键盘导航、行删除、拖拽重排、批量编辑合并为一次写入）由 `entity-table/vtable` 下的工具驱动，通常经 `EntityTable` / `QueryTable` 组件使用。

> 操作列删除判定：`actionsColumn` 的第三位是**必填**的 `canDelete` 判定（见[迁移说明](migration.md#操作列删除判定)）。

## 查询构建器引擎

查询条件树（规则、AND/OR 分组、嵌套）的完整操作面，与仓库查询格式互为可转换表示：

```typescript
import { createQueryBuilderService } from '@aiao/rxdb-model';

const service = createQueryBuilderService();

// 规则/分组增删（缺省目标即根分组）、AND/OR 组合切换、条目移动、最大嵌套深度限制
service.addRule(null, { field: 'title', operator: 'contains', value: '草稿' });
service.addRule(null, { field: 'completed', operator: '=', value: false });
service.updateGroupCombinator(service.getState().rootGroup.id, 'or');
service.moveItem(ruleId, service.getState().rootGroup.id, 0);

// 与仓库查询格式双向转换（toRxDBQuery → 仓库查询；fromRxDBQuery ← 从既有查询回填状态）
const repositoryQuery = service.toRxDBQuery();
service.fromRxDBQuery(repositoryQuery);

// 逐规则即时校验：非法值给出结构化错误（含字段路径与原因）
const result = service.validate();
if (!result.valid) {
  console.error(result.errors); // [{ field, rule, message }, …]
}
```

脱离状态容器单独使用：`QueryConverter`（`toRxDBQuery(state)` / `fromRxDBQuery(query)`，`state` 为 `{ rootGroup }` 形态的 `QueryBuilderState`）、`ValidationService`（`validateRule` / `validateGroup`）、`createOperatorRegistry` / `getDefaultOperatorRegistry`、`createSchemaParser`。核心模型（`UIRule`、`QueryBuilderRuleGroup`、`FieldMetadata`、`ValidationResult`）与完整导出见 [API 文档](../api/rxdb-model)。

## 手动排序实体（US-028）

声明了排序域的实体按「分组字段组合 + 手动顺序」排序；`defaultListOrderBy` 给出实体默认排序，`canReorderEntityList` 判定当前列表是否允许拖拽排序，`commitRowMove` 把行拖放结果落库。`EntityList` 已内置这些行为，直接使用组件即可。

## 界面能力派生（US-027）

`deriveEntityCapabilities(metadata)` 把实体的写操作权限（create / update / delete 各为 `both` 或 `system`）投影为界面能力 `{ canCreate, canEdit, canDelete }`：`EntityList` 据此隐藏「+ 新增」、把行降级为只读（详情以查看模式打开）、或隐藏操作列的删除入口。
