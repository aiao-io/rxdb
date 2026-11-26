# makeEditorForReadonly()

```ts
function makeEditorForReadonly(
  editorName
): string | IEditor<any, any> | ((args) => string | IEditor<any, any>) | undefined;
```

Defined in: [packages/rxdb-model/src/entity-table/columns/column-utils.ts:143](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/columns/column-utils.ts#L143)

Builds an editor function: non-read-only rows use the given editor name, read-only rows return undefined.

Used for ColumnDefine.editor to distinguish read-only/editable state at the row level.

## Parameters

| Parameter    | Type     | Description                                 |
| ------------ | -------- | ------------------------------------------- |
| `editorName` | `string` | The editor name used for non-read-only rows |

## Returns

\| `string`
\| `IEditor`&lt;`any`, `any`&gt;
\| ((`args`) => `string` \| `IEditor`&lt;`any`, `any`&gt;)
\| `undefined`

An editor callback that can be attached to ColumnDefine.editor
