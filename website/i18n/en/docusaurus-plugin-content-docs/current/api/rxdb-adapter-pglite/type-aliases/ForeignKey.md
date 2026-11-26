# ForeignKey

```ts
type ForeignKey = object;
```

Defined in: [packages/rxdb-adapter-pglite/src/pglite.interface.ts:172](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/pglite.interface.ts#L172)

Foreign key constraint info type
Describes foreign key relationships between tables

## Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="property-column_name"></a> `column_name` | `string` | Column name | [packages/rxdb-adapter-pglite/src/pglite.interface.ts:186](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/pglite.interface.ts#L186) |
| <a id="property-constraint_catalog"></a> `constraint_catalog` | `string` | Constraint catalog name | [packages/rxdb-adapter-pglite/src/pglite.interface.ts:174](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/pglite.interface.ts#L174) |
| <a id="property-constraint_name"></a> `constraint_name` | `string` | Constraint name | [packages/rxdb-adapter-pglite/src/pglite.interface.ts:178](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/pglite.interface.ts#L178) |
| <a id="property-constraint_schema"></a> `constraint_schema` | `string` | Constraint schema name | [packages/rxdb-adapter-pglite/src/pglite.interface.ts:176](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/pglite.interface.ts#L176) |
| <a id="property-ordinal_position"></a> `ordinal_position` | `number` | Ordinal position of the column within the constraint | [packages/rxdb-adapter-pglite/src/pglite.interface.ts:188](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/pglite.interface.ts#L188) |
| <a id="property-position_in_unique_constraint"></a> `position_in_unique_constraint?` | `number` | Position within the unique constraint | [packages/rxdb-adapter-pglite/src/pglite.interface.ts:190](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/pglite.interface.ts#L190) |
| <a id="property-table_catalog"></a> `table_catalog` | `string` | Table catalog name | [packages/rxdb-adapter-pglite/src/pglite.interface.ts:180](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/pglite.interface.ts#L180) |
| <a id="property-table_name"></a> `table_name` | `string` | Table name | [packages/rxdb-adapter-pglite/src/pglite.interface.ts:184](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/pglite.interface.ts#L184) |
| <a id="property-table_schema"></a> `table_schema` | `string` | Table schema name | [packages/rxdb-adapter-pglite/src/pglite.interface.ts:182](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/pglite.interface.ts#L182) |
