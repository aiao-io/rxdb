# RxDBBranchSwitchTakeover

```ts
type RxDBBranchSwitchTakeover = 'switched' | 'not_applicable';
```

Defined in: [packages/rxdb/src/rxdb-plugin-system.ts:181](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-plugin-system.ts#L181)

One takeover declaration

## Remarks

Made of two literals rather than a `boolean`: at the call site `if (await c.takeOverBranchSwitch(ctx))` reads like
"can it switch", while what it answers is "does this switch still need me" — the two readings give opposite behavior on the day a `!` is missed,
and neither errors.
