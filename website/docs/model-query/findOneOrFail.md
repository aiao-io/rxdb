# findOneOrFail

`findOneOrFail` 查第一条满足条件的记录；没有结果时直接抛出 `RxDBError`。

## 签名

```ts
findOneOrFail(options: FindOneOrFailOptions<T>): Observable<InstanceType<T>>
```

## 基础用法

```ts
import { firstValueFrom } from 'rxjs';

const todo = await firstValueFrom(
  Todo.findOneOrFail({
    where: {
      combinator: 'and',
      rules: [{ field: 'id', operator: '=', value: todoId }]
    }
  })
);
```

## 错误文本

当前仓库抛错时使用的文本格式是：

```ts
Entity not found for query: ${JSON.stringify(options.where)}
```

这比直接抛一个 `[object Object]` 更适合排查。

## 什么时候该用它

- 这条记录必须存在
- 查不到就该直接走异常分支
- 你不想在业务代码里到处写 `if (!entity)`

## 仍然建议写 `orderBy`

如果你的条件可能命中多条记录，`findOneOrFail` 也不会自动给你一个稳定顺序，顺序仍然取决于 `orderBy`。

## 示例：异常处理

```ts
try {
  const todo = await firstValueFrom(
    Todo.findOneOrFail({
      where: {
        combinator: 'and',
        rules: [{ field: 'id', operator: '=', value: id }]
      }
    })
  );
} catch (error) {
  console.error('记录不存在', error);
}
```

## 和 `findOne` 的区别

| 方法            | 未找到时行为 | 返回类型                |
| --------------- | ------------ | ----------------------- |
| `findOne`       | 返回 `null`  | `Observable<T \| null>` |
| `findOneOrFail` | 抛错         | `Observable<T>`         |

## 参考

- [findOne](./findOne.md)
- [get](./get.md)
- [find](./find.md)
