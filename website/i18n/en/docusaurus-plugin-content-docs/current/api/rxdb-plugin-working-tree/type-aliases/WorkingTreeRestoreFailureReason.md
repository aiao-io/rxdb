# WorkingTreeRestoreFailureReason

```ts
type WorkingTreeRestoreFailureReason = 'conflict' | 'dirty_working_tree' | 'incompatible_schema' | 'unreachable_target';
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/restore-command.ts:81](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/restore-command.ts#L81)

Why one `restore()` call was rejected.

## Remarks

The discriminator is a `reason` rather than "which field is present": restore has more than one failure exit; discriminating by fields would make every new
reason silently handled as an old reason by all old call sites' `else` branches.
