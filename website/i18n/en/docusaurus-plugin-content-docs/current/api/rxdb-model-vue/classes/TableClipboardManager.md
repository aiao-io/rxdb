# TableClipboardManager

Defined in: packages/rxdb-model/dist/entity-table/vtable/table-clipboard.d.ts:81

Internal clipboard manager — wraps system clipboard API interaction + internal backup

## Constructors

### Constructor

```ts
new TableClipboardManager(): TableClipboardManager;
```

#### Returns

`TableClipboardManager`

## Methods

### copy() \{#copy\}

```ts
copy(table, columns?): Promise<void>;
```

Defined in: packages/rxdb-model/dist/entity-table/vtable/table-clipboard.d.ts:84

Copies the current selection to the system clipboard and writes an internal backup

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `table` | `ListTableAll` |
| `columns?` | readonly `Record`&lt;`string`, `unknown`&gt;[] |

#### Returns

`Promise`&lt;`void`&gt;

***

### paste() \{#paste\}

```ts
paste(table, columns?): Promise<PendingWrite[]>;
```

Defined in: packages/rxdb-model/dist/entity-table/vtable/table-clipboard.d.ts:86

Pastes: when the system clipboard text differs from the last write, parse it as text; otherwise fall back to the internal backup and write by column matching

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `table` | `ListTableAll` |
| `columns?` | readonly `Record`&lt;`string`, `unknown`&gt;[] |

#### Returns

`Promise`&lt;[`PendingWrite`](../interfaces/PendingWrite.md)[]&gt;
