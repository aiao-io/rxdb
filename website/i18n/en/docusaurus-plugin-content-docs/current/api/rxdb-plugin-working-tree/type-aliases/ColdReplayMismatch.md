# ColdReplayMismatch

```ts
type ColdReplayMismatch =
  | {
      actual: unknown;
      entity: string;
      entityId: string;
      field: string;
      kind: 'field_mismatch';
      namespace: string;
      replayed: unknown;
    }
  | {
      entity: string;
      entityId: string;
      kind: 'replay_only_row';
      namespace: string;
    }
  | {
      entity: string;
      entityId: string;
      kind: 'business_only_row';
      namespace: string;
    };
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/cold-replay.ts:57](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/cold-replay.ts#L57)

One difference between the replay result and the actual contents of the business tables.

## Union Members

### Type Literal

```ts
{
  actual: unknown;
  entity: string;
  entityId: string;
  field: string;
  kind: 'field_mismatch';
  namespace: string;
  replayed: unknown;
}
```

#### actual

```ts
readonly actual: unknown;
```

The value in the business table; `undefined` when the column does not exist

#### entity

```ts
readonly entity: string;
```

The entity name

#### entityId

```ts
readonly entityId: string;
```

The entity primary key

#### field

```ts
readonly field: string;
```

The column name that mismatches

#### kind

```ts
readonly kind: "field_mismatch";
```

A column of the same row mismatches

#### namespace

```ts
readonly namespace: string;
```

The namespace the entity belongs to

#### replayed

```ts
readonly replayed: unknown;
```

The value produced by the replay; `undefined` when the column does not exist

---

### Type Literal

```ts
{
  entity: string;
  entityId: string;
  kind: 'replay_only_row';
  namespace: string;
}
```

#### entity

```ts
readonly entity: string;
```

The entity name

#### entityId

```ts
readonly entityId: string;
```

The entity primary key

#### kind

```ts
readonly kind: "replay_only_row";
```

The replay produced a row the business tables do not have — a **phantom capture**, a unit written that should
not have been

#### namespace

```ts
readonly namespace: string;
```

The namespace the entity belongs to

---

### Type Literal

```ts
{
  entity: string;
  entityId: string;
  kind: 'business_only_row';
  namespace: string;
}
```

#### entity

```ts
readonly entity: string;
```

The entity name

#### entityId

```ts
readonly entityId: string;
```

The entity primary key

#### kind

```ts
readonly kind: "business_only_row";
```

The business table has a row the replay does not — a **missed mount point capture**

#### namespace

```ts
readonly namespace: string;
```

The namespace the entity belongs to
