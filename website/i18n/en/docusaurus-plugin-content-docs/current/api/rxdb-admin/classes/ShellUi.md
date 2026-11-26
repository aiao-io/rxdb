# ShellUi

Defined in: [layout/ui-state.ts:29](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/layout/ui-state.ts#L29)

Holder of the shell's transient UI state and its actions.

## Implements

- [`ReadableStore`](../interfaces/ReadableStore.md)&lt;[`ShellUiState`](../interfaces/ShellUiState.md)&gt;

## Constructors

### Constructor

```ts
new ShellUi(): ShellUi;
```

#### Returns

`ShellUi`

## Accessors

### changes$ \{#changes\}

#### Get Signature

```ts
get changes$(): Observable<ShellUiState>;
```

Defined in: [layout/ui-state.ts:38](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/layout/ui-state.ts#L38)

Replays the current state and pushes subsequent changes.

##### Returns

`Observable`&lt;[`ShellUiState`](../interfaces/ShellUiState.md)&gt;

An observable that replays the current value and pushes subsequent changes.

#### Implementation of

[`ReadableStore`](../interfaces/ReadableStore.md).[`changes$`](../interfaces/ReadableStore.md#changes)

***

### value \{#value\}

#### Get Signature

```ts
get value(): ShellUiState;
```

Defined in: [layout/ui-state.ts:33](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/layout/ui-state.ts#L33)

Snapshot of the current state.

##### Returns

[`ShellUiState`](../interfaces/ShellUiState.md)

Synchronous snapshot of the current value.

#### Implementation of

[`ReadableStore`](../interfaces/ReadableStore.md).[`value`](../interfaces/ReadableStore.md#value)

## Methods

### refresh() \{#refresh\}

```ts
refresh(): void;
```

Defined in: [layout/ui-state.ts:94](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/layout/ui-state.ts#L94)

Refreshes the current page: increments the refresh counter, and the content area rebuilds from it.

#### Returns

`void`

***

### setDrawer() \{#setdrawer\}

```ts
setDrawer(open): void;
```

Defined in: [layout/ui-state.ts:60](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/layout/ui-state.ts#L60)

Sets the mobile sidebar drawer.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `open` | `boolean` | Whether it is open. |

#### Returns

`void`

***

### setHoverExpanded() \{#sethoverexpanded\}

```ts
setHoverExpanded(expanded): void;
```

Defined in: [layout/ui-state.ts:68](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/layout/ui-state.ts#L68)

Sets the collapsed sidebar's hover expansion.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `expanded` | `boolean` | Whether it is expanded. |

#### Returns

`void`

***

### setMaximized() \{#setmaximized\}

```ts
setMaximized(maximized): void;
```

Defined in: [layout/ui-state.ts:81](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/layout/ui-state.ts#L81)

Sets content maximization.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `maximized` | `boolean` | Whether it is maximized. |

#### Returns

`void`

***

### setNavigating() \{#setnavigating\}

```ts
setNavigating(navigating): void;
```

Defined in: [layout/ui-state.ts:102](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/layout/ui-state.ts#L102)

Marks navigation as in progress.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `navigating` | `boolean` | Whether it is in progress. |

#### Returns

`void`

***

### setPreferencesOpen() \{#setpreferencesopen\}

```ts
setPreferencesOpen(open): void;
```

Defined in: [layout/ui-state.ts:89](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/layout/ui-state.ts#L89)

Opens / closes the preferences drawer.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `open` | `boolean` | Whether it is open. |

#### Returns

`void`

***

### subscribe() \{#subscribe\}

```ts
subscribe(listener): () => void;
```

Defined in: [layout/ui-state.ts:47](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/layout/ui-state.ts#L47)

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

### toggleDrawer() \{#toggledrawer\}

```ts
toggleDrawer(): void;
```

Defined in: [layout/ui-state.ts:52](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/layout/ui-state.ts#L52)

Toggles the mobile sidebar drawer.

#### Returns

`void`

***

### toggleMaximize() \{#togglemaximize\}

```ts
toggleMaximize(): void;
```

Defined in: [layout/ui-state.ts:73](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/layout/ui-state.ts#L73)

Toggles content maximization.

#### Returns

`void`
