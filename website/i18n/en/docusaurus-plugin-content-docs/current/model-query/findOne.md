# findOne

`findOne` returns the first matching record; with no match it returns `null`.

## Signature

```ts
findOne(options: FindOneOptions<T>): Observable<InstanceType<T> | null>
```

## Basic usage

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

## When to use it

- "No match" is a normal business branch
- You want the first record under some condition
- You use `orderBy` to define what "first" means for your business

## Always mind the `orderBy`

If the `where` can match several records and you omit `orderBy`, "first" has no stable business meaning.

```ts
const latest = await firstValueFrom(
  Todo.findOne({
    where: { combinator: 'and', rules: [] },
    orderBy: [{ field: 'createdAt', sort: 'desc' }]
  })
);
```

## Difference from `findOneOrFail`

| Method          | When nothing matches |
| --------------- | -------------------- |
| `findOne`       | Returns `null`       |
| `findOneOrFail` | Throws               |

## See also

- [findOneOrFail](./findOneOrFail.md)
- [get](./get.md)
- [find](./find.md)
