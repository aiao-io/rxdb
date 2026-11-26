# DevToolsNativeEntry

Defined in: [native/native-files-provider.ts:42](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/native/native-files-provider.ts#L42)

A native directory entry.

## Properties

### kind \{#kind\}

```ts
readonly kind: "file" | "directory";
```

Defined in: [native/native-files-provider.ts:46](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/native/native-files-provider.ts#L46)

The entry type.

***

### lastModified \{#lastmodified\}

```ts
readonly lastModified: number;
```

Defined in: [native/native-files-provider.ts:50](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/native/native-files-provider.ts#L50)

The last modification time (epoch milliseconds).

***

### name \{#name\}

```ts
readonly name: string;
```

Defined in: [native/native-files-provider.ts:44](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/native/native-files-provider.ts#L44)

The logical name of the entry within its parent directory.

***

### size \{#size\}

```ts
readonly size: number;
```

Defined in: [native/native-files-provider.ts:48](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/native/native-files-provider.ts#L48)

The byte count; always 0 for directories.
