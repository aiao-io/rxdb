# findOneOrFail

`findOneOrFail` returns the first matching record; with no match it throws an `RxDBError`.

## Signature

```ts
findOneOrFail(options: FindOneOrFailOptions<T>): Observable<InstanceType<T>>
```

## Basic usage

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

## Error text

The current repository throws with this text format:

```ts
Entity not found for query: ${JSON.stringify(options.where)}
```

This is easier to debug than a bare `[object Object]`.

## When to use it

- The record must exist
- A missing record should take the exception branch
- You do not want `if (!entity)` checks scattered through business code

## Still write the `orderBy`

If your condition can match several records, `findOneOrFail` does not give you a stable order either; the order still depends on `orderBy`.

## Example: error handling

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
  console.error('Record not found', error);
}
```

## Difference from `findOne`

| Method          | When nothing matches | Return type             |
| --------------- | -------------------- | ----------------------- |
| `findOne`       | Returns `null`       | `Observable<T \| null>` |
| `findOneOrFail` | Throws               | `Observable<T>`         |

## See also

- [findOne](./findOne.md)
- [get](./get.md)
- [find](./find.md)
