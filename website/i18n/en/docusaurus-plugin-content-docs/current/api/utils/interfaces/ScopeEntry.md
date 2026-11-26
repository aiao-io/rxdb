# ScopeEntry

Defined in: [packages/utils/src/lifecycle/lifecycle-scope.interface.ts:35](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/lifecycle/lifecycle-scope.interface.ts#L35)

The snapshot node returned by [LifecycleScope.getEntries](../classes/LifecycleScope.md#getentries).

It is a **snapshot**, not a live reference: registering or releasing afterwards is not reflected in the returned array, and mutating the return value does not affect the scope itself.

## Properties

### children \{#children\}

```ts
children: ScopeEntry[];
```

Defined in: [packages/utils/src/lifecycle/lifecycle-scope.interface.ts:43](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/lifecycle/lifecycle-scope.interface.ts#L43)

The recursive snapshot of child scope entries, all the way down.

Ordinary entries are `[]` rather than `undefined` — callers don't need a null check at every level.

***

### label \{#label\}

```ts
label: string;
```

Defined in: [packages/utils/src/lifecycle/lifecycle-scope.interface.ts:37](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/lifecycle/lifecycle-scope.interface.ts#L37)

The label passed at registration; `'anonymous'` when not provided. Diagnostic only; not part of identity.
