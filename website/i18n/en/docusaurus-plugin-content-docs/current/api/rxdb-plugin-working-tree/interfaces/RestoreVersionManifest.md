# RestoreVersionManifest

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/restore-precheck.ts:99](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/restore-precheck.ts#L99)

The version manifest: the two values the user compares against "what do I have over here".

## Remarks

Both are taken from the **current process**, not read back from the data. When the versions mismatch, the value in the data is exactly the untrustworthy one; reporting it only makes the user cross-check two numbers of unknown provenance.

## Properties

### codecVersion \{#codecversion\}

```ts
readonly codecVersion: number;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/restore-precheck.ts:101](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/restore-precheck.ts#L101)

The current client's change codec version; equals `RXDB_CHANGE_CODEC_VERSION`

***

### entityResolved \{#entityresolved\}

```ts
readonly entityResolved: boolean;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/restore-precheck.ts:104](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/restore-precheck.ts#L104)

Can the ChangeSet's target entity be resolved on the current client
