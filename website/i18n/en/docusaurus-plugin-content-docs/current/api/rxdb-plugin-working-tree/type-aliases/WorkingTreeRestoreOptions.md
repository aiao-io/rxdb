# WorkingTreeRestoreOptions

```ts
type WorkingTreeRestoreOptions = WorkingTreeCredentials;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/restore-command.ts:72](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/restore-command.ts#L72)

The arguments of a `restore()` call: three captured slots, no fourth.

## Remarks

**Identical** to [WorkingTreeCredentials](../interfaces/WorkingTreeCredentials.md), not a layer on top of it:
any fourth key would be asking "what to do when dirty" or "who wins on conflict", and FR-014 / FR-034 answer
those two questions with "reject" and "keep both, hand them to the person looking at the screen" respectively —
so they have no argument to carry.

An alias rather than `extends` of an empty interface: an empty interface here would only leave future readers
a slot for "add one field here", and that slot is exactly the one that must stay empty.
