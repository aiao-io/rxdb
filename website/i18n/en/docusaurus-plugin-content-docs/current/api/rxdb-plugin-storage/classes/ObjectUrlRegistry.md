# ObjectUrlRegistry

Defined in: [packages/rxdb-plugin-storage/src/object-url.ts:23](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-storage/src/object-url.ts#L23)

Uniformly manages object URL creation and revocation.

The registry holds the URLs it creates; callers can revoke them one by one, or
clear them all at once when the host is destroyed.

## Constructors

### Constructor

```ts
new ObjectUrlRegistry(createImpl?, revokeImpl?): ObjectUrlRegistry;
```

Defined in: [packages/rxdb-plugin-storage/src/object-url.ts:37](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-storage/src/object-url.ts#L37)

Creates the registry.

#### Parameters

| Parameter     | Type                 | Description                                                            |
| ------------- | -------------------- | ---------------------------------------------------------------------- |
| `createImpl?` | (`blob`) => `string` | The object URL creation function; defaults to `URL.createObjectURL`.   |
| `revokeImpl?` | (`url`) => `void`    | The object URL revocation function; defaults to `URL.revokeObjectURL`. |

#### Returns

`ObjectUrlRegistry`

## Accessors

### size \{#size\}

#### Get Signature

```ts
get size(): number;
```

Defined in: [packages/rxdb-plugin-storage/src/object-url.ts:27](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-storage/src/object-url.ts#L27)

The number of object URLs not yet revoked.

##### Returns

`number`

## Methods

### clear() \{#clear\}

```ts
clear(): void;
```

Defined in: [packages/rxdb-plugin-storage/src/object-url.ts:67](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-storage/src/object-url.ts#L67)

Revokes all object URLs the registry still holds.

#### Returns

`void`

---

### create() \{#create\}

```ts
create(blob): string;
```

Defined in: [packages/rxdb-plugin-storage/src/object-url.ts:43](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-storage/src/object-url.ts#L43)

Creates and registers an object URL.

#### Parameters

| Parameter | Type   |
| --------- | ------ |
| `blob`    | `Blob` |

#### Returns

`string`

---

### createPreview() \{#createpreview\}

```ts
createPreview(blob, type?): StoragePreviewResult;
```

Defined in: [packages/rxdb-plugin-storage/src/object-url.ts:50](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-storage/src/object-url.ts#L50)

Creates a preview result with a one-shot dispose callback.

#### Parameters

| Parameter | Type     |
| --------- | -------- |
| `blob`    | `Blob`   |
| `type?`   | `string` |

#### Returns

[`StoragePreviewResult`](../interfaces/StoragePreviewResult.md)

---

### revoke() \{#revoke\}

```ts
revoke(url): void;
```

Defined in: [packages/rxdb-plugin-storage/src/object-url.ts:61](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-storage/src/object-url.ts#L61)

Revokes a registered URL; unknown or already-revoked URLs are a no-op.

#### Parameters

| Parameter | Type     |
| --------- | -------- |
| `url`     | `string` |

#### Returns

`void`
