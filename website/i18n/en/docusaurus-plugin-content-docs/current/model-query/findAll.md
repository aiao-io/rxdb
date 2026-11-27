# findAll

`findAll` returns every matching result, with no pagination cutoff.

## Signature

```ts
findAll(options: FindAllOptions<T>): Observable<InstanceType<T>[]>
```

```ts
interface FindAllOptions<T> {
  where: RuleGroup<InstanceType<T>>;
  orderBy?: OrderBy[];
}
```

## Basic usage

```ts
import { firstValueFrom } from 'rxjs';

const allTodos = await firstValueFrom(
  Todo.findAll({
    where: { combinator: 'and', rules: [] },
    orderBy: [{ field: 'createdAt', sort: 'desc' }]
  })
);
```

## When to use it

- Configuration lists
- Small dictionary tables
- A full pull before export
- Secondary processing in local memory

## When not to use it

- Paginating a large table
- Infinite scrolling
- When you only need the first few dozen rows

Use [find](./find.md) or [findByCursor](./findByCursor.md) for those cases.

## Performance notes

`findAll` pulls back every matching result. With a large dataset, the UI and memory give out before the API itself does.

Avoid `findAll` when the data can keep growing.
