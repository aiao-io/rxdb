# TabsStore

Defined in: [tabs/tabs-store.ts:80](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/tabs/tabs-store.ts#L80)

Tab state: open / close / pin / reorder / visit history, persisted to session or device per preferences.

## Remarks

Router-agnostic: the shell calls [TabsStore.open](#open) after every route change,
and when the current tab is closed this class returns the address to navigate to,
leaving the actual navigation to the shell's router.

## Implements

- [`ReadableStore`](../interfaces/ReadableStore.md)&lt;[`TabsState`](../interfaces/TabsState.md)&gt;

## Constructors

### Constructor

```ts
new TabsStore(options): TabsStore;
```

Defined in: [tabs/tabs-store.ts:102](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/tabs/tabs-store.ts#L102)

Creates the tab state and restores it from the persistence medium.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options` | [`TabsStoreOptions`](../interfaces/TabsStoreOptions.md) | Configuration and storage. |

#### Returns

`TabsStore`

## Accessors

### changes$ \{#changes\}

#### Get Signature

```ts
get changes$(): Observable<TabsState>;
```

Defined in: [tabs/tabs-store.ts:94](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/tabs/tabs-store.ts#L94)

Replays the current state and pushes subsequent changes.

##### Returns

`Observable`&lt;[`TabsState`](../interfaces/TabsState.md)&gt;

An observable that replays the current value and pushes subsequent changes.

#### Implementation of

[`ReadableStore`](../interfaces/ReadableStore.md).[`changes$`](../interfaces/ReadableStore.md#changes)

***

### value \{#value\}

#### Get Signature

```ts
get value(): TabsState;
```

Defined in: [tabs/tabs-store.ts:89](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/tabs/tabs-store.ts#L89)

Synchronous snapshot of the current state.

##### Returns

[`TabsState`](../interfaces/TabsState.md)

Synchronous snapshot of the current value.

#### Implementation of

[`ReadableStore`](../interfaces/ReadableStore.md).[`value`](../interfaces/ReadableStore.md#value)

## Methods

### close() \{#close\}

```ts
close(key): CloseOutcome;
```

Defined in: [tabs/tabs-store.ts:141](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/tabs/tabs-store.ts#L141)

Closes a tab.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `key` | `string` | The tab key. |

#### Returns

[`CloseOutcome`](../type-aliases/CloseOutcome.md)

The address to navigate to; see [CloseOutcome](../type-aliases/CloseOutcome.md).

***

### closeAll() \{#closeall\}

```ts
closeAll(): CloseOutcome;
```

Defined in: [tabs/tabs-store.ts:176](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/tabs/tabs-store.ts#L176)

Closes all unpinned tabs.

#### Returns

[`CloseOutcome`](../type-aliases/CloseOutcome.md)

See [CloseOutcome](../type-aliases/CloseOutcome.md).

***

### closeLeft() \{#closeleft\}

```ts
closeLeft(key): CloseOutcome;
```

Defined in: [tabs/tabs-store.ts:159](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/tabs/tabs-store.ts#L159)

Closes the tabs to the left.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `key` | `string` | The reference tab key. |

#### Returns

[`CloseOutcome`](../type-aliases/CloseOutcome.md)

See [CloseOutcome](../type-aliases/CloseOutcome.md).

***

### closeOthers() \{#closeothers\}

```ts
closeOthers(key): CloseOutcome;
```

Defined in: [tabs/tabs-store.ts:150](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/tabs/tabs-store.ts#L150)

Closes the remaining tabs.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `key` | `string` | The tab key to keep. |

#### Returns

[`CloseOutcome`](../type-aliases/CloseOutcome.md)

See [CloseOutcome](../type-aliases/CloseOutcome.md).

***

### closeRight() \{#closeright\}

```ts
closeRight(key): CloseOutcome;
```

Defined in: [tabs/tabs-store.ts:168](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/tabs/tabs-store.ts#L168)

Closes the tabs to the right.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `key` | `string` | The reference tab key. |

#### Returns

[`CloseOutcome`](../type-aliases/CloseOutcome.md)

See [CloseOutcome](../type-aliases/CloseOutcome.md).

***

### deactivate() \{#deactivate\}

```ts
deactivate(): void;
```

Defined in: [tabs/tabs-store.ts:132](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/tabs/tabs-store.ts#L132)

When the current route belongs to no tab, clears the active state while keeping existing tabs and visit history.

#### Returns

`void`

***

### destroy() \{#destroy\}

```ts
destroy(): void;
```

Defined in: [tabs/tabs-store.ts:206](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/tabs/tabs-store.ts#L206)

Stops following preference changes.

#### Returns

`void`

***

### open() \{#open\}

```ts
open(url, title): void;
```

Defined in: [tabs/tabs-store.ts:125](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/tabs/tabs-store.ts#L125)

Opens or activates a tab (called after route changes).

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `url` | `string` | The current address. |
| `title` | `string` | The title. |

#### Returns

`void`

***

### reorder() \{#reorder\}

```ts
reorder(key, toIndex): void;
```

Defined in: [tabs/tabs-store.ts:193](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/tabs/tabs-store.ts#L193)

Moves a tab.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `key` | `string` | The tab key. |
| `toIndex` | `number` | The target index. |

#### Returns

`void`

***

### retitle() \{#retitle\}

```ts
retitle(resolve): void;
```

Defined in: [tabs/tabs-store.ts:201](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/tabs/tabs-store.ts#L201)

Re-resolves titles (after language switches or menu updates).

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `resolve` | (`url`) => `string` \| `undefined` | Returns a title from the address; `undefined` keeps it unchanged. |

#### Returns

`void`

***

### subscribe() \{#subscribe\}

```ts
subscribe(listener): () => void;
```

Defined in: [tabs/tabs-store.ts:116](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/tabs/tabs-store.ts#L116)

Subscribes to subsequent changes.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `listener` | (`value`) => `void` | Change callback. |

#### Returns

An unsubscribe function.

() => `void`

#### Implementation of

[`ReadableStore`](../interfaces/ReadableStore.md).[`subscribe`](../interfaces/ReadableStore.md#subscribe)

***

### togglePin() \{#togglepin\}

```ts
togglePin(key): void;
```

Defined in: [tabs/tabs-store.ts:184](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/tabs/tabs-store.ts#L184)

Toggles pinned state.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `key` | `string` | The tab key. |

#### Returns

`void`
