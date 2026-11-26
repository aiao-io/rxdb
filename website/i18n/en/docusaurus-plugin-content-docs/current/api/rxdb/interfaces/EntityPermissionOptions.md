# EntityPermissionOptions

Defined in: [packages/rxdb/src/entity/entity-options.interface.ts:78](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-options.interface.ts#L78)

Declaration of the entity's write operation permissions

## Remarks

This is **fail-fast**, not a security boundary: it errors early at the entrance of user writes and lets the UI hide create / edit / delete accordingly,
but it cannot stop writes that bypass the facade.

- Checked at: the facade `Repository`'s `create()` / `update()` / `remove()`,
  the whole-batch precheck of `EntityManager.mutations()`, and `Repository.reorder()` (reading neighbors and writing go through the executor,
  so it judges by `update` itself before opening the transaction);
- Not checked: the adapter and executor layers (sync pull, migrations, history replay, working tree materialization all go through here) — this is the channel for system writes.

Inherited per operation to the nearest declaration: when a subclass only writes `{ delete: 'system' }`, a parent's tightened `update` still passes down;
operations undeclared anywhere on the prototype chain default to `'both'`.

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

Create

---

### delete? \{#delete\}

```ts
delete?: EntityOperationPermission;
```

Defined in: [packages/rxdb/src/entity/entity-options.interface.ts:84](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-options.interface.ts#L84)

Delete

---

### update? \{#update\}

```ts
update?: EntityOperationPermission;
```

Defined in: [packages/rxdb/src/entity/entity-options.interface.ts:82](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-options.interface.ts#L82)

Update
