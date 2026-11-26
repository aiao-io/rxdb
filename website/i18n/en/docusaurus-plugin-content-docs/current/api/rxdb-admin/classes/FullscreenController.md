# FullscreenController

Defined in: [widgets/fullscreen.ts:46](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/widgets/fullscreen.ts#L46)

Browser fullscreen control; state syncs with `fullscreenchange` (even Esc exits are detected).

## Remarks

The browser may reject fullscreen requests when there is no user gesture, the iframe lacks
permission, or the host view does not support it (the Promise rejects or never settles).
The controller funnels these cases into an `unsupported` state instead of throwing unhandled
errors, so buttons disable themselves and tell the user the environment cannot do it.

## Constructors

### Constructor

```ts
new FullscreenController(document): FullscreenController;
```

Defined in: [widgets/fullscreen.ts:66](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/widgets/fullscreen.ts#L66)

Creates the controller.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `document` | [`FullscreenDocument`](../interfaces/FullscreenDocument.md) \| `undefined` | The document; when omitted (SSR / tests), toggling becomes a no-op and the state is marked unsupported. |

#### Returns

`FullscreenController`

## Accessors

### isFullscreen \{#isfullscreen\}

#### Get Signature

```ts
get isFullscreen(): ReadableStore<boolean>;
```

Defined in: [widgets/fullscreen.ts:53](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/widgets/fullscreen.ts#L53)

Whether fullscreen is active.

##### Returns

[`ReadableStore`](../interfaces/ReadableStore.md)&lt;`boolean`&gt;

***

### unsupported \{#unsupported\}

#### Get Signature

```ts
get unsupported(): ReadableStore<boolean>;
```

Defined in: [widgets/fullscreen.ts:58](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/widgets/fullscreen.ts#L58)

Whether fullscreen is currently unusable in this environment: the capability is missing, or the most recent toggle was rejected / never settled.

##### Returns

[`ReadableStore`](../interfaces/ReadableStore.md)&lt;`boolean`&gt;

## Methods

### destroy() \{#destroy\}

```ts
destroy(): void;
```

Defined in: [widgets/fullscreen.ts:92](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/widgets/fullscreen.ts#L92)

Stops listening.

#### Returns

`void`

***

### toggle() \{#toggle\}

```ts
toggle(): Promise<void>;
```

Defined in: [widgets/fullscreen.ts:75](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/widgets/fullscreen.ts#L75)

Enters or exits fullscreen.

#### Returns

`Promise`&lt;`void`&gt;
