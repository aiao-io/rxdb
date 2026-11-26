# EntityToOneRelationFieldDescriptor

```ts
type EntityToOneRelationFieldDescriptor = EntityRelationFieldDescriptorBase & object;
```

Defined in: [packages/rxdb/src/entity/entity-field.utils.ts:293](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-field.utils.ts#L293)

`1:1` / `m:1` relation: single-valued, writes a foreign-key column, and the semantics are "set / clear".

## Type Declaration

### cardinality

```ts
cardinality: "single";
```

### encrypted

```ts
encrypted: boolean;
```

### nullable

```ts
nullable: boolean;
```

### relation

```ts
relation: object;
```

#### relation.kind

```ts
kind: `${MANY_TO_ONE | ONE_TO_ONE}`;
```

#### relation.mutation

```ts
mutation: "set-remove";
```

#### relation.writeField

```ts
writeField: string;
```

### required

```ts
required: boolean;
```

### unique

```ts
unique: boolean;
```
