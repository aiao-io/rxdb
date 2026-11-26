# registerEditor()

```ts
function registerEditor(name, editor): void;
```

Defined in: packages/rxdb-model/dist/entity-table/vtable/table-factory.d.ts:15

Registers a custom editor

The business layer calls this function to register domain-specific editors (e.g. a property type selector).

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `name` | `string` | Editor name |
| `editor` | `unknown` | Editor instance |

## Returns

`void`
