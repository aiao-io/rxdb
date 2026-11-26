# StorageFilesystemContext

Defined in: [packages/rxdb-plugin-storage/src/filesystem/storage-filesystem.ts:155](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-storage/src/filesystem/storage-filesystem.ts#L155)

Host information visible when creating a backend instance.

## Remarks

Carries only the fields **the backend selection needs as criteria**, never the
RxDB instance: once the seam can get the whole instance, the backend could
bypass the service layer and read/write the database directly, and the
transaction boundary between the two would lose its meaning.

## Properties

### localAdapterName \{#localadaptername\}

```ts
readonly localAdapterName: string | undefined;
```

Defined in: [packages/rxdb-plugin-storage/src/filesystem/storage-filesystem.ts:163](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-storage/src/filesystem/storage-filesystem.ts#L163)

The adapter name configured by `sync.local`; `undefined` when no local adapter is configured.

#### Remarks

The desktop backend uses this to reject the mismatched combination of
"metadata in browser storage, files in a native directory" — that is exactly
the "two backup domains" US-504 exists to eliminate, and silently accepting it
would leave the problem in a different form.
