# ListViewSettingsController

Defined in: packages/rxdb-model/dist/entity-list/list-view-settings.d.ts:9

Popover positioning, pointer drag and keyboard reordering for list settings, shared across the three frameworks.

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

Releases the popover and drag listeners, canceling any drag not yet committed.

#### Returns

`void`
