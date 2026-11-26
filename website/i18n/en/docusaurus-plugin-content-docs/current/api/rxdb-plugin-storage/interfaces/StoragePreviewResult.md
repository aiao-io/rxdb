# StoragePreviewResult

Defined in: [packages/rxdb-plugin-storage/src/object-url.ts:9](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-storage/src/object-url.ts#L9)

A file preview result that can be explicitly disposed.

## Properties

### dispose \{#dispose\}

```ts
dispose: () => void;
```

Defined in: [packages/rxdb-plugin-storage/src/object-url.ts:15](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-storage/src/object-url.ts#L15)

Revokes the object URL; calling again is a no-op.

#### Returns

`void`

***

### type \{#type\}

```ts
type: string;
```

Defined in: [packages/rxdb-plugin-storage/src/object-url.ts:13](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-storage/src/object-url.ts#L13)

The MIME type the caller should use when rendering the preview.

***

### url \{#url\}

```ts
url: string;
```

Defined in: [packages/rxdb-plugin-storage/src/object-url.ts:11](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-storage/src/object-url.ts#L11)

The browser object URL.
