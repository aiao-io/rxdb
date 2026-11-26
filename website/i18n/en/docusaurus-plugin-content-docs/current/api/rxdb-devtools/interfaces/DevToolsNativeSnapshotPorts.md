# DevToolsNativeSnapshotPorts

Defined in: [native/native-snapshot-source.ts:64](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/native/native-snapshot-source.ts#L64)

Construction ports for the native snapshot source.

## Properties

### lock \{#lock\}

```ts
readonly lock: DevToolsSnapshotLock;
```

Defined in: [native/native-snapshot-source.ts:66](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/native/native-snapshot-source.ts#L66)

The storage-wide exclusive lock.

## Methods

### epoch() \{#epoch\}

```ts
epoch(): Promise<string>;
```

Defined in: [native/native-snapshot-source.ts:73](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/native/native-snapshot-source.ts#L73)

The current capture epoch.

#### Returns

`Promise`&lt;`string`&gt;

#### Remarks

Only requires that two calls at the same point in time are equal; no monotonicity or
parsability is required — this module only performs equality comparisons.

---

### readCommittedFiles() \{#readcommittedfiles\}

```ts
readCommittedFiles(signal): Promise<readonly DevToolsSnapshotEntry[]>;
```

Defined in: [native/native-snapshot-source.ts:77](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/native/native-snapshot-source.ts#L77)

Reads all **committed** logical files under the lock; temporary artifacts of in-flight uploads
must not appear.

#### Parameters

| Parameter | Type          |
| --------- | ------------- |
| `signal`  | `AbortSignal` |

#### Returns

`Promise`&lt;readonly [`DevToolsSnapshotEntry`](DevToolsSnapshotEntry.md)[]&gt;

---

### readMetadata() \{#readmetadata\}

```ts
readMetadata(signal): Promise<readonly DevToolsSnapshotEntry[]>;
```

Defined in: [native/native-snapshot-source.ts:75](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/native/native-snapshot-source.ts#L75)

Reads all metadata rows under the lock.

#### Parameters

| Parameter | Type          |
| --------- | ------------- |
| `signal`  | `AbortSignal` |

#### Returns

`Promise`&lt;readonly [`DevToolsSnapshotEntry`](DevToolsSnapshotEntry.md)[]&gt;
