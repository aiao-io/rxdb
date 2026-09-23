# findAncestors

`findAncestors` 用于树结构实体的祖先查询。它返回的是响应式 `Observable`。

> 四个树查询由插件包 `@aiao/rxdb-plugin-tree` 提供，库侧需先 `rxdb.use(rxDBPluginTree)`。见[树结构拆包](../migration/tree-split.md)。

## 树关系图

```mermaid
erDiagram
    MENU ||--o{ MENU : children
```

## 签名

```ts
findAncestors(options: FindTreeOptions<T>): Observable<InstanceType<T>[]>
```

## level 语义

- **不传 `level`：不限制深度**，返回整条祖先链
- 层级数从当前节点算起：当前节点为 `0`、父节点为 `1`
- `level` 必须是非负安全整数，**不设上界**
- 负数 / 小数 / 非数字一律同步抛 `RxDBError`，既不裁剪也不兜底

## 返回语义

传 `entityId` 时，返回“当前节点 + 祖先节点”。

此 API 通常应显式传入 `entityId`。

## 基础用法

```ts
import { firstValueFrom } from 'rxjs';

const ancestors = await firstValueFrom(
  Menu.findAncestors({
    entityId: leaf.id,
    level: 3
  })
);
```

## 面包屑场景

```ts
const ancestors = await firstValueFrom(Menu.findAncestors({ entityId: leaf.id }));

const breadcrumb = ancestors.slice().reverse();
```

## 顺序说明

不要假设数据库天然返回”从根到叶”的顺序。如 UI 依赖顺序，应在业务层显式处理，如 `reverse()`。

## 参考

- [countAncestors](./countAncestors.md)
- [findDescendants](./findDescendants.md)
