# count

`count` 只返回数量，不返回实体本身。

## 签名

```ts
count(options: CountOptions<T>): Observable<number>
```

## 基础用法

```ts
import { firstValueFrom } from 'rxjs';

const total = await firstValueFrom(
  Todo.count({
    where: { combinator: 'and', rules: [] }
  })
);
```

## 条件计数

```ts
const completed = await firstValueFrom(
  Todo.count({
    where: {
      combinator: 'and',
      rules: [{ field: 'completed', operator: '=', value: true }]
    }
  })
);
```

## 最常见组合

```ts
const where = {
  combinator: 'and' as const,
  rules: [{ field: 'completed', operator: '=', value: false }]
};

const [items, total] = await Promise.all([
  firstValueFrom(Todo.find({ where, limit: 20, offset: 0 })),
  firstValueFrom(Todo.count({ where }))
]);
```

## 返回语义

- 空结果返回 `0`
- 不会返回 `null`
- 这是 `Observable<number>`，不是 `Promise<number>`

## 什么时候用它

- 列表总数
- 徽标数字
- “是否大于 0”的快速判断

## 参考

- [find](./find.md)
- [findByCursor](./findByCursor.md)
