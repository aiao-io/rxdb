# EntityToManyRelationFieldDescriptor

```ts
type EntityToManyRelationFieldDescriptor = EntityRelationFieldDescriptorBase & object;
```

Defined in: [packages/rxdb/src/entity/entity-field.utils.ts:307](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-field.utils.ts#L307)

`1:m` / `m:n` relation: multi-valued, no writable foreign-key column, and the semantics are "join / remove".

## Type Declaration

### cardinality

```ts
cardinality: 'multiple';
```

### encrypted?

```ts
encrypted?: never;
```

### nullable?

```ts
nullable?: never;
```

### relation

```ts
relation: object;
```

#### relation.kind

```ts
kind: `${MANY_TO_MANY | ONE_TO_MANY}`;
```

#### relation.mutation

```ts
mutation: 'add-remove';
```

#### relation.writeField?

```ts
writeField?: never;
```

### required?

```ts
required?: never;
```

### unique?

```ts
unique?: never;
```
