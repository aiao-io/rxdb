# registerEditor()

```ts
function registerEditor(name, editor): void;
```

Defined in: [packages/rxdb-model/src/entity-table/vtable/table-factory.ts:55](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/vtable/table-factory.ts#L55)

Registers a custom editor

The business layer calls this function to register domain-related editors (such as a property type selector).

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `name` | `string` | Editor name |
| `editor` | `unknown` | Editor instance |

## Returns

`void`
