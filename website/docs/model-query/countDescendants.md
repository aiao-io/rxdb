# countDescendants

`countDescendants` 统计树结构实体的后代数量，不返回实体本身。

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

## 参考

- [findDescendants](./findDescendants.md)
- [countAncestors](./countAncestors.md)
