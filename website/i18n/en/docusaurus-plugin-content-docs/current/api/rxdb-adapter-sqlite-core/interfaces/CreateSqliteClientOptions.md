# CreateSqliteClientOptions

Defined in: [packages/rxdb-adapter-sqlite-core/src/create\_sqlite\_client.ts:8](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/create_sqlite_client.ts#L8)

Options for creating a Worker-capable SQLite client.

## Properties

### sharedWorker? \{#sharedworker\}

```ts
sharedWorker?: boolean;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/create\_sqlite\_client.ts:11](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/create_sqlite_client.ts#L11)

***

### sharedWorkerInstance? \{#sharedworkerinstance\}

```ts
sharedWorkerInstance?: SharedWorker;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/create\_sqlite\_client.ts:12](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/create_sqlite_client.ts#L12)

***

### worker? \{#worker\}

```ts
worker?: boolean;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/create\_sqlite\_client.ts:9](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/create_sqlite_client.ts#L9)

***

### workerInstance? \{#workerinstance\}

```ts
workerInstance?: Worker;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/create\_sqlite\_client.ts:10](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/create_sqlite_client.ts#L10)

***

### workerOwnership? \{#workerownership\}

```ts
workerOwnership?: "caller" | "client";
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/create\_sqlite\_client.ts:19](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/create_sqlite_client.ts#L19)

The lifecycle owner of the Worker transport.

`caller` keeps the thread for reuse by subsequent connections; `client` terminates the Worker when the client proxy is released (for SharedWorker, closes its root port). Defaults to `caller`, preserving existing caller ownership.
