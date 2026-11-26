# ListViewSettingsController

Defined in: [packages/rxdb-model/src/entity-list/list-view-settings.ts:14](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-list/list-view-settings.ts#L14)

Popover positioning, pointer drag, and keyboard reorder for the list settings shared by all three frameworks.

## Constructors

### Constructor

```ts
new ListViewSettingsController(root, options): ListViewSettingsController;
```

Defined in: [packages/rxdb-model/src/entity-list/list-view-settings.ts:20](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-list/list-view-settings.ts#L20)

#### Parameters

| Parameter | Type                                                                                      |
| --------- | ----------------------------------------------------------------------------------------- |
| `root`    | `HTMLElement`                                                                             |
| `options` | [`ListViewSettingsControllerOptions`](../interfaces/ListViewSettingsControllerOptions.md) |

#### Returns

`ListViewSettingsController`

## Methods

### dispose() \{#dispose\}

```ts
dispose(): void;
```

Defined in: [packages/rxdb-model/src/entity-list/list-view-settings.ts:44](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-list/list-view-settings.ts#L44)

Releases the popover and drag listeners, cancelling any uncommitted drag.

#### Returns

`void`
