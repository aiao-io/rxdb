# countAncestors

`countAncestors` 统计树结构实体的祖先数量，不返回实体本身。

## 签名

```ts
countAncestors(options: FindTreeOptions<T>): Observable<number>
```

## 统计语义

- 传 `entityId`：不包含当前节点，只统计祖先数量
- `level` 的归一化规则与 [findAncestors](./findAncestors.md) 一致
- 根节点的祖先数量通常就是 `0`

## 基础用法

```ts
import { firstValueFrom } from 'rxjs';

const count = await firstValueFrom(
  Menu.countAncestors({
    entityId: leaf.id
  })
);
```

## 判断是否为根节点

```ts
const isRoot = (await firstValueFrom(Menu.countAncestors({ entityId: node.id }))) === 0;
```

## 限制层级统计

```ts
const parentOnly = await firstValueFrom(
  Menu.countAncestors({
    entityId: leaf.id,
    level: 1
  })
);
```

## 参考

- [findAncestors](./findAncestors.md)
- [countDescendants](./countDescendants.md)
