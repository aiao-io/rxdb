# EntityPermissionOptions

Defined in: [packages/rxdb/src/entity/entity-options.interface.ts:78](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-options.interface.ts#L78)

An entity's write-operation permission declaration.

## Remarks

This is **fail-fast**, not a security boundary: it reports errors early at the entries where users write, and
lets the UI hide create / edit / delete accordingly, but it cannot block writes that bypass the facade.

- Checkpoints: `create()` / `update()` / `remove()` of the facade `Repository`, the whole-batch precheck of
  `EntityManager.mutations()`, and `Repository.reorder()` (reading neighbors and writing go through the
  executor, so it judges by `update` itself before opening the transaction);
- Not checked: the adapter and executor layers (sync pull, migrations, history replay, working-tree
  materialization all go through here) — this is the channel for system writes.

Inherited nearest-first per operation: when a subclass writes only `{ delete: 'system' }`, a tightened
`update` from the parent is still passed down; operations declared nowhere on the whole prototype chain take
`'both'`.

## Example

```typescript
@Entity({ name: 'ExchangeRate', permissions: { create: 'system', update: 'system', delete: 'system' } })
class ExchangeRate extends EntityBase {}
```

## Properties

### create? \{#create\}

```ts
create?: EntityOperationPermission;
```

Defined in: [packages/rxdb/src/entity/entity-options.interface.ts:80](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-options.interface.ts#L80)

Create.

---

### delete? \{#delete\}

```ts
delete?: EntityOperationPermission;
```

Defined in: [packages/rxdb/src/entity/entity-options.interface.ts:84](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-options.interface.ts#L84)

Delete.

---

### update? \{#update\}

```ts
update?: EntityOperationPermission;
```

Defined in: [packages/rxdb/src/entity/entity-options.interface.ts:82](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-options.interface.ts#L82)

Update.
