# countDescendants

`countDescendants` 统计树结构实体的后代数量，不返回实体本身。

> 四个树查询由插件包 `@aiao/rxdb-plugin-tree` 提供，库侧需先 `rxdb.use(rxDBPluginTree)`。见[树结构拆包](../migration/tree-split.md)。

## 签名

```ts
countDescendants(options: FindTreeOptions<T>): Observable<number>
```

## 统计语义

- 传 `entityId`：不包含当前节点，只统计后代数量
- 不传 `entityId`：以所有根节点为起点执行统计
- `level` 的归一化规则与 [findDescendants](./findDescendants.md) 一致

## 基础用法

```ts
import { firstValueFrom } from 'rxjs';

const count = await firstValueFrom(
  Menu.countDescendants({
    entityId: root.id,
    level: 2
  })
);
```

## 直接子节点数量

```ts
const directChildCount = await firstValueFrom(
  Menu.countDescendants({
    entityId: root.id,
    level: 1
  })
);
```

## 过滤统计

```ts
const activeCount = await firstValueFrom(
  Menu.countDescendants({
    entityId: root.id,
    where: {
      combinator: 'and',
      rules: [{ field: 'enabled', operator: '=', value: true }]
    }
  })
);
```

:::tip 顺序说明

计数没有顺序概念。树里兄弟的显示顺序（建树顺序）来自常规查询的默认排序：对声明 `manualOrder: { groupBy: ['parentId'] }` 的可排序树实体，不带 `orderBy` 的查询按 `[parentId, sortOrder, id]` 返回。见[手动排序（manualOrder 与 reorder）](../model-mutation/reorder.md)。

:::

## 参考

- [findDescendants](./findDescendants.md)
- [countAncestors](./countAncestors.md)
