# findDescendants

`findDescendants` 用于树结构实体的后代查询。它返回的是响应式 `Observable`。

> 四个树查询由插件包 `@aiao/rxdb-plugin-tree` 提供，库侧需先 `rxdb.use(rxDBPluginTree)`。见[树结构拆包](../migration/tree-split.md)。

## 适用对象

- 继承 `TreeAdjacencyListEntityBase` 的实体
- 通常配合 `@TreeEntity()` 使用

## 树关系图

```mermaid
erDiagram
    MENU ||--o{ MENU : children
```

## 签名

```ts
findDescendants(options: FindTreeOptions<T>): Observable<InstanceType<T>[]>
```

```ts
interface FindTreeOptions<T> {
  entityId?: EntityStaticType<T, 'idType'> | null;
  where?: RuleGroup<InstanceType<T>>;
  level?: number;
}
```

## level 语义

- **不传 `level`：不限制深度**，返回整棵子树
- 层级数从当前节点算起：当前节点为 `0`、直接子节点为 `1`
- `level` 必须是非负安全整数，**不设上界**
- 负数 / 小数 / 非数字一律同步抛 `RxDBError`，既不裁剪也不兜底

这意味着：

- `entityId` 已知且不传 `level` 时，返回当前节点及其全部后代
- `entityId` 已知且 `level: 0` 时，只返回当前节点
- `entityId` 已知且 `level: 1` 时，返回当前节点和直接子节点
- `entityId` 未传且 `level: 0` 时，返回根节点集合

## 返回语义

- 传 `entityId`：返回“当前节点 + 后代节点”
- 不传 `entityId`：以所有根节点为起点执行查询

## 基础用法

```ts
import { firstValueFrom } from 'rxjs';

const descendants = await firstValueFrom(
  Menu.findDescendants({
    entityId: root.id,
    level: 2
  })
);
```

## 过滤后代

```ts
const visibleDescendants = await firstValueFrom(
  Menu.findDescendants({
    entityId: root.id,
    level: 3,
    where: {
      combinator: 'and',
      rules: [{ field: 'enabled', operator: '=', value: true }]
    }
  })
);
```

## 什么时候用它

- 渲染树形菜单
- 加载某个目录下的全部子节点
- 对某个子树做批量过滤

## 参考

- [countDescendants](./countDescendants.md)
- [findAncestors](./findAncestors.md)
