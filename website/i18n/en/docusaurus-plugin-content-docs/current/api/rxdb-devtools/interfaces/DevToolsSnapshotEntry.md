# DevToolsSnapshotEntry

Defined in: [native/native-snapshot-source.ts:31](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/native/native-snapshot-source.ts#L31)

A raw entry of a snapshot; the `side` is determined by the port reading it, not declared by the entry itself.

## Properties

### contentVersion \{#contentversion\}

```ts
readonly contentVersion: string | null;
```

Defined in: [native/native-snapshot-source.ts:39](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/native/native-snapshot-source.ts#L39)

The content version; `null` when absent.

***

### id \{#id\}

```ts
readonly id: string | null;
```

Defined in: [native/native-snapshot-source.ts:35](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/native/native-snapshot-source.ts#L35)

The record ID; the second ordering key, `null` when absent.

***

### logicalPath \{#logicalpath\}

```ts
readonly logicalPath: string;
```

Defined in: [native/native-snapshot-source.ts:33](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/native/native-snapshot-source.ts#L33)

The logical path; the first ordering key.

***

### size \{#size\}

```ts
readonly size: number | null;
```

Defined in: [native/native-snapshot-source.ts:37](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/native/native-snapshot-source.ts#L37)

The byte count; `null` when absent.
