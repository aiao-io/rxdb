# MediaQueryLike

Defined in: [media.ts:4](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/media.ts#L4)

The minimal contract of `MediaQueryList`.

## Properties

### matches \{#matches\}

```ts
readonly matches: boolean;
```

Defined in: [media.ts:6](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/media.ts#L6)

Whether it currently matches.

## Methods

### addEventListener() \{#addeventlistener\}

```ts
addEventListener(type, listener): void;
```

Defined in: [media.ts:8](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/media.ts#L8)

Listens for match state changes.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `type` | `"change"` |
| `listener` | (`event`) => `void` |

#### Returns

`void`

***

### removeEventListener() \{#removeeventlistener\}

```ts
removeEventListener(type, listener): void;
```

Defined in: [media.ts:10](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/media.ts#L10)

Removes the listener.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `type` | `"change"` |
| `listener` | (`event`) => `void` |

#### Returns

`void`
