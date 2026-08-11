# findOne

`findOne` 查第一条满足条件的记录；没有结果时返回 `null`。

## 签名

```ts
findOne(options: FindOneOptions<T>): Observable<InstanceType<T> | null>
```

## 基础用法

```ts
import { firstValueFrom } from 'rxjs';

const todo = await firstValueFrom(
  Todo.findOne({
    where: {
      combinator: 'and',
      rules: [{ field: 'completed', operator: '=', value: false }]
    },
    orderBy: [{ field: 'createdAt', sort: 'desc' }]
  })
);

if (todo) {
  console.log(todo.title);
}
```

## 什么时候该用它

- 允许“查不到”是正常业务分支
- 你想拿某个条件下的第一条记录
- 你会用 `orderBy` 定义“第一条”的业务含义

## 一定要注意 `orderBy`

如果 `where` 可能匹配多条，而你又不写 `orderBy`，那“第一条”不是稳定业务语义。

```ts
const latest = await firstValueFrom(
  Todo.findOne({
    where: { combinator: 'and', rules: [] },
    orderBy: [{ field: 'createdAt', sort: 'desc' }]
  })
);
```

## 和 `findOneOrFail` 的区别

| 方法            | 没找到时    |
| --------------- | ----------- |
| `findOne`       | 返回 `null` |
| `findOneOrFail` | 抛错        |

## 参考

- [findOneOrFail](./findOneOrFail.md)
- [get](./get.md)
- [find](./find.md)
