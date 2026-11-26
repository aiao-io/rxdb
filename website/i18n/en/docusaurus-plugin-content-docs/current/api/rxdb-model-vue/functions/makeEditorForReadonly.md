# makeEditorForReadonly()

```ts
function makeEditorForReadonly(editorName): 
  | string
  | IEditor<any, any>
  | ((args) => string | IEditor<any, any>)
  | undefined;
```

Defined in: packages/rxdb-model/dist/entity-table/columns/column-utils.d.ts:95

Builds an editor function: non-readonly rows use the given editor name, readonly rows return undefined

Used for ColumnDefine.editor to distinguish readonly/editable state at the row level.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `editorName` | `string` | The editor name used by non-readonly rows |

## Returns

  \| `string`
  \| `IEditor`&lt;`any`, `any`&gt;
  \| ((`args`) => `string` \| `IEditor`&lt;`any`, `any`&gt;)
  \| `undefined`

An editor callback that can be attached to ColumnDefine.editor
