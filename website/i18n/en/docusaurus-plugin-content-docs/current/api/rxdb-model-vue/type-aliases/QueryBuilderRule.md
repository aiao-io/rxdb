---
sidebar_label: 'QueryBuilderRule⟨T⟩'
---

# QueryBuilderRule`<T>`

```ts
type QueryBuilderRule<T> = UIRule & object;
```

Defined in: packages/rxdb-model/dist/query-builder/models/query-builder-state.d.ts:53

Query rule (reuses the RxDB Rule type + UI metadata)

## Type Parameters

| Type Parameter                    | Default type                        | Description |
| --------------------------------- | ----------------------------------- | ----------- |
| <a id="type-parameter-t"></a> `T` | `Record`&lt;`string`, `unknown`&gt; | Entity type |

## Type Declaration

### field

```ts
field: string | keyof T & string;
```

Field name (type-safe entity field key or string)

### id

```ts
id: string;
```

Unique rule identifier
Used for React key, Angular trackBy, Vue :key

### operator

```ts
operator: OperatorName | string;
```

Operator (RxDB OperatorName or a custom string)

## Template

**K**

Field key type (inferred automatically)

## Example

```typescript
interface User {
  name: string;
  age: number;
  active: boolean;
}

const rule: QueryBuilderRule<User> = {
  id: 'rule-1',
  field: 'name', // ✅ type-safe: only 'name' | 'age' | 'active'
  operator: 'contains',
  value: 'John' // ✅ inferred as string
};
```
