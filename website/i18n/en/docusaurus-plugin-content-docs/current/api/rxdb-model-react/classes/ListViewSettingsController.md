# ListViewSettingsController

Defined in: packages/rxdb-model/dist/entity-list/list-view-settings.d.ts:9

Positioning of the list-settings popover, pointer dragging, and keyboard reordering shared across the three frameworks.

## Constructors

### Constructor

```ts
new ListViewSettingsController(root, options): ListViewSettingsController;
```

Defined in: packages/rxdb-model/dist/entity-list/list-view-settings.d.ts:11

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `root` | `HTMLElement` |
| `options` | [`ListViewSettingsControllerOptions`](../interfaces/ListViewSettingsControllerOptions.md) |

#### Returns

`ListViewSettingsController`

## Methods

### dispose() \{#dispose\}

```ts
dispose(): void;
```

Defined in: packages/rxdb-model/dist/entity-list/list-view-settings.d.ts:13

Releases the popover and drag listeners, and cancels any uncommitted drag.

#### Returns

`void`
