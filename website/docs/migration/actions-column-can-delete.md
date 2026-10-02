# 操作列删除判定：`actionsColumn` 新增 `canDelete`

`@aiao/rxdb-model` 的 `actionsColumn` 在第三位新增了**必填**参数 `canDelete`，原来第三位的查看文案顺延到第四位：

```typescript
// 之前
actionsColumn(title: string, deleteLabel: string, viewLabel?: string): ColumnDefine;

// 之后
actionsColumn(title: string, deleteLabel: string, canDelete: RecordDeletePredicate, viewLabel?: string): ColumnDefine;
```

这是一次**破坏性变更**：两参、三参的旧调用在编译期报 TS2554 / TS2345；绕过类型检查的 JS 调用会在渲染有记录的单元格时抛 `canDelete is not a function`。
只通过 `EntityList`（Angular / React / Vue）或 `buildEditableColumns` 使用操作列、从未直接调 `actionsColumn` 的应用不受影响。

## 为什么改

旧版按「行是否只读」决定显示什么：只读行整列为空，非只读行一律给删除按钮。实体操作权限模型（US-027）把创建、编辑、删除拆成三种独立能力之后，这条规则两头都错：

- `update: 'system'` 的实体行只读，但 `delete: 'both'` 时仍应能删；
- `delete: 'system'` 的实体行可编辑，却不该出删除按钮。

删除能力只能由调用方按实体权限给出，`actionsColumn` 不再替你猜，所以 `canDelete` 是必填、没有默认值。查看按钮也随之与只读解耦：传了 `viewLabel` 就每行都有。

## 怎么改

按实体元数据派生，与 `EntityList` 内部的判定一致：

```typescript
import { actionsColumn, deriveEntityCapabilities } from '@aiao/rxdb-model';

const { canDelete } = deriveEntityCapabilities(metadata);

// 之前
actionsColumn('操作', '删除', '查看');
// 之后
actionsColumn('操作', '删除', () => canDelete, '查看');
```

`canDelete` 逐行调用，确实需要按行区分时直接读记录：

```typescript
actionsColumn('操作', '删除', record => record['locked'] !== true);
```

想原样保留旧行为（只读行不可删），用公开的 `isReadonly`：

```typescript
import { actionsColumn, isReadonly } from '@aiao/rxdb-model';

actionsColumn('操作', '删除', record => !isReadonly(record), '查看');
```

注意旧版只读行连查看按钮也不显示；新版查看按钮不再受只读影响。
