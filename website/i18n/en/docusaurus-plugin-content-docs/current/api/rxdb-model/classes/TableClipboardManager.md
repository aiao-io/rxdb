# TableClipboardManager

Defined in: [packages/rxdb-model/src/entity-table/vtable/table-clipboard.ts:396](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/vtable/table-clipboard.ts#L396)

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

Defined in: [packages/rxdb-model/src/entity-table/vtable/table-clipboard.ts:401](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/vtable/table-clipboard.ts#L401)

Copies the current selection to the system clipboard and writes it to the internal backup

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

Defined in: [packages/rxdb-model/src/entity-table/vtable/table-clipboard.ts:415](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/vtable/table-clipboard.ts#L415)

Paste: parses by text when the system clipboard text differs from the last write, otherwise falls back to the internal backup matched by column for writing

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `table` | `ListTableAll` |
| `columns?` | readonly `Record`&lt;`string`, `unknown`&gt;[] |

#### Returns

`Promise`&lt;[`PendingWrite`](../interfaces/PendingWrite.md)[]&gt;
