# PreferencesHost

Defined in: [preferences/store.ts:36](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/preferences/store.ts#L36)

The host event source listened to by the preferences store, which `window` naturally satisfies.

## Methods

### addEventListener() \{#addeventlistener\}

```ts
addEventListener(type, listener): void;
```

Defined in: [preferences/store.ts:38](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/preferences/store.ts#L38)

Registers a listener.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `type` | `"storage"` \| `"pagehide"` |
| `listener` | (`event`) => `void` |

#### Returns

`void`

***

### removeEventListener() \{#removeeventlistener\}

```ts
removeEventListener(type, listener): void;
```

Defined in: [preferences/store.ts:40](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/preferences/store.ts#L40)

Removes the listener.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `type` | `"storage"` \| `"pagehide"` |
| `listener` | (`event`) => `void` |

#### Returns

`void`
