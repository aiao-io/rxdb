# ActiveBranchEntityHost

Defined in: [packages/rxdb/src/system/active-branch-guard.ts:145](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/active-branch-guard.ts#L145)

The minimal capability [resolveSingleActiveBranch](../functions/resolveSingleActiveBranch.md) needs to create `main`.

## Remarks

Narrowed to a structural type instead of taking `RxDB` directly, so that the first-time migration can call it —
migration code only has an `EntityManager` at hand (see the parameters of `commit/enable-migration.ts`), not an `RxDB`
instance. `RxDB` structurally satisfies this interface, and both call sites share the same implementation.

## Properties

### entityManager \{#entitymanager\}

```ts
readonly entityManager: EntityManager;
```

Defined in: [packages/rxdb/src/system/active-branch-guard.ts:147](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/active-branch-guard.ts#L147)

Used to `instantiate(RxDBBranch)`.
