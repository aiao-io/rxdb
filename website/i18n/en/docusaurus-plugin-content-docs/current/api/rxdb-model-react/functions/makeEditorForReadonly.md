# makeEditorForReadonly()

```ts
function makeEditorForReadonly(editorName): 
  | string
  | IEditor<any, any>
  | ((args) => string | IEditor<any, any>)
  | undefined;
```

Defined in: packages/rxdb-model/dist/entity-table/columns/column-utils.d.ts:95

Builds an editor function: uses the given editor name for non-read-only rows and returns undefined for read-only rows

Used for ColumnDefine.editor to distinguish read-only/editable state at the row level.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `editorName` | `string` | The editor name to use for non-read-only rows |

## Returns

  \| `string`
  \| `IEditor`&lt;`any`, `any`&gt;
  \| ((`args`) => `string` \| `IEditor`&lt;`any`, `any`&gt;)
  \| `undefined`

An editor callback that can be assigned to ColumnDefine.editor
