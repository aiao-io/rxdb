# Query operators

RxDB describes query conditions with one unified `RuleGroup` structure.

## Basic structure

```ts
interface Rule<T = any, K extends keyof T = keyof T> {
  field: K;
  operator: OperatorName;
  value?: any;
  where?: RuleGroup<any>;
}

interface RuleGroup<T = any> {
  combinator: 'and' | 'or';
  rules: Array<RuleGroup<T> | Rule<T>>;
}
```

## Operator categories

- Comparison: `=`, `!=`, `<`, `>`, `<=`, `>=`
- Set: `in`, `notIn`
- Range: `between`, `notBetween`
- String: `contains`, `notContains`, `startsWith`, `notStartsWith`, `endsWith`, `notEndsWith`
- Existence: `exists`, `notExists`

## Basic example

```ts
const where = {
  combinator: 'and',
  rules: [
    { field: 'completed', operator: '=', value: false },
    { field: 'title', operator: 'contains', value: keyword }
  ]
} as const;
```

## Nested groups

```ts
const where = {
  combinator: 'and',
  rules: [
    { field: 'completed', operator: '=', value: false },
    {
      combinator: 'or',
      rules: [
        { field: 'priority', operator: '=', value: 'high' },
        { field: 'dueDate', operator: '<=', value: new Date() }
      ]
    }
  ]
} as const;
```

## Relation fields

```ts
const where = {
  combinator: 'and',
  rules: [{ field: 'owner.name', operator: 'startsWith', value: 'A' }]
};
```

## The correct shape for `exists` / `notExists`

Do not stuff the sub-query conditions into `value` here. The correct structure in the current implementation is `where`:

```ts
const where = {
  combinator: 'and',
  rules: [
    {
      field: 'children',
      operator: 'exists',
      where: {
        combinator: 'and',
        rules: [{ field: 'enabled', operator: '=', value: true }]
      }
    }
  ]
};
```

## Null checks

```ts
{ field: 'parentId', operator: '=', value: null }
{ field: 'email', operator: '!=', value: null }
```

## See also

- [exists-operator](./exists-operator.md)
- [find](./find.md)
