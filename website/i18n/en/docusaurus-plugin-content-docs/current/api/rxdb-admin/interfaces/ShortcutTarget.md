# ShortcutTarget

Defined in: [shortcuts/registry.ts:32](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/shortcuts/registry.ts#L32)

A target onto which keyboard listeners can be mounted, which `window` / `document` naturally satisfy.

## Methods

### addEventListener() \{#addeventlistener\}

```ts
addEventListener(
   type, 
   listener, 
   capture
): void;
```

Defined in: [shortcuts/registry.ts:34](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/shortcuts/registry.ts#L34)

Registers a listener.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `type` | `"keydown"` |
| `listener` | (`event`) => `void` |
| `capture` | `boolean` |

#### Returns

`void`

***

### removeEventListener() \{#removeeventlistener\}

```ts
removeEventListener(
   type, 
   listener, 
   capture
): void;
```

Defined in: [shortcuts/registry.ts:36](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/shortcuts/registry.ts#L36)

Removes the listener.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `type` | `"keydown"` |
| `listener` | (`event`) => `void` |
| `capture` | `boolean` |

#### Returns

`void`
