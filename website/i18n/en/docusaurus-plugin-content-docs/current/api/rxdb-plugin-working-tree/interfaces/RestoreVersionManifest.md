# RestoreVersionManifest

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/restore-precheck.ts:99](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/restore-precheck.ts#L99)

The version manifest: the two values the user compares against "what do I have on my side".

## Remarks

Both items are taken from the **current process**, not read back from the data. On a version mismatch, the value in the data is precisely the untrustworthy one;
reporting it would only have the user cross-check two numbers of unknown provenance.

## Properties

### codecVersion \{#codecversion\}

```ts
readonly codecVersion: number;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/restore-precheck.ts:101](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/restore-precheck.ts#L101)

The current client's change codec version; equal to `RXDB_CHANGE_CODEC_VERSION`

---

### entityResolved \{#entityresolved\}

```ts
readonly entityResolved: boolean;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/restore-precheck.ts:104](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/restore-precheck.ts#L104)

Whether the ChangeSet's target entity resolves on the current client
