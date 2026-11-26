# PgliteTableColumn

Defined in: [packages/rxdb-adapter-pglite/src/pglite.interface.ts:75](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/pglite.interface.ts#L75)

PGlite database table column information interface
Contains all fields of the PostgreSQL information_schema.columns view

## Properties

### character\_maximum\_length? \{#character_maximum_length\}

```ts
character_maximum_length?: number;
```

Defined in: [packages/rxdb-adapter-pglite/src/pglite.interface.ts:93](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/pglite.interface.ts#L93)

Maximum length of a character type

***

### character\_octet\_length? \{#character_octet_length\}

```ts
character_octet_length?: number;
```

Defined in: [packages/rxdb-adapter-pglite/src/pglite.interface.ts:95](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/pglite.interface.ts#L95)

Byte length of a character type

***

### character\_set\_catalog? \{#character_set_catalog\}

```ts
character_set_catalog?: string;
```

Defined in: [packages/rxdb-adapter-pglite/src/pglite.interface.ts:109](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/pglite.interface.ts#L109)

Character set catalog

***

### character\_set\_name? \{#character_set_name\}

```ts
character_set_name?: string;
```

Defined in: [packages/rxdb-adapter-pglite/src/pglite.interface.ts:113](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/pglite.interface.ts#L113)

Character set name

***

### character\_set\_schema? \{#character_set_schema\}

```ts
character_set_schema?: string;
```

Defined in: [packages/rxdb-adapter-pglite/src/pglite.interface.ts:111](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/pglite.interface.ts#L111)

Character set schema

***

### collation\_catalog? \{#collation_catalog\}

```ts
collation_catalog?: string;
```

Defined in: [packages/rxdb-adapter-pglite/src/pglite.interface.ts:115](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/pglite.interface.ts#L115)

Collation catalog

***

### collation\_name? \{#collation_name\}

```ts
collation_name?: string;
```

Defined in: [packages/rxdb-adapter-pglite/src/pglite.interface.ts:119](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/pglite.interface.ts#L119)

Collation name

***

### collation\_schema? \{#collation_schema\}

```ts
collation_schema?: string;
```

Defined in: [packages/rxdb-adapter-pglite/src/pglite.interface.ts:117](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/pglite.interface.ts#L117)

Collation schema

***

### column\_default \{#column_default\}

```ts
column_default: unknown;
```

Defined in: [packages/rxdb-adapter-pglite/src/pglite.interface.ts:87](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/pglite.interface.ts#L87)

Default value of the column

***

### column\_name \{#column_name\}

```ts
column_name: string;
```

Defined in: [packages/rxdb-adapter-pglite/src/pglite.interface.ts:83](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/pglite.interface.ts#L83)

Column name

***

### constraint\_type \{#constraint_type\}

```ts
constraint_type: string;
```

Defined in: [packages/rxdb-adapter-pglite/src/pglite.interface.ts:165](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/pglite.interface.ts#L165)

Constraint type

***

### data\_type \{#data_type\}

```ts
data_type: string;
```

Defined in: [packages/rxdb-adapter-pglite/src/pglite.interface.ts:91](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/pglite.interface.ts#L91)

Data type

***

### datetime\_precision? \{#datetime_precision\}

```ts
datetime_precision?: number;
```

Defined in: [packages/rxdb-adapter-pglite/src/pglite.interface.ts:103](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/pglite.interface.ts#L103)

Precision of a date-time type

***

### domain\_catalog? \{#domain_catalog\}

```ts
domain_catalog?: string;
```

Defined in: [packages/rxdb-adapter-pglite/src/pglite.interface.ts:121](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/pglite.interface.ts#L121)

Domain catalog

***

### domain\_name? \{#domain_name\}

```ts
domain_name?: string;
```

Defined in: [packages/rxdb-adapter-pglite/src/pglite.interface.ts:125](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/pglite.interface.ts#L125)

Domain name

***

### domain\_schema? \{#domain_schema\}

```ts
domain_schema?: string;
```

Defined in: [packages/rxdb-adapter-pglite/src/pglite.interface.ts:123](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/pglite.interface.ts#L123)

Domain schema

***

### dtd\_identifier \{#dtd_identifier\}

```ts
dtd_identifier: string;
```

Defined in: [packages/rxdb-adapter-pglite/src/pglite.interface.ts:141](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/pglite.interface.ts#L141)

Data type descriptor identifier

***

### generation\_expression? \{#generation_expression\}

```ts
generation_expression?: string;
```

Defined in: [packages/rxdb-adapter-pglite/src/pglite.interface.ts:161](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/pglite.interface.ts#L161)

Generation expression of a generated column

***

### identity\_cycle \{#identity_cycle\}

```ts
identity_cycle: string;
```

Defined in: [packages/rxdb-adapter-pglite/src/pglite.interface.ts:157](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/pglite.interface.ts#L157)

Whether the identity column cycles

***

### identity\_generation? \{#identity_generation\}

```ts
identity_generation?: string;
```

Defined in: [packages/rxdb-adapter-pglite/src/pglite.interface.ts:147](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/pglite.interface.ts#L147)

Generation mode of the identity column

***

### identity\_increment? \{#identity_increment\}

```ts
identity_increment?: string;
```

Defined in: [packages/rxdb-adapter-pglite/src/pglite.interface.ts:151](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/pglite.interface.ts#L151)

Increment of the identity column

***

### identity\_maximum? \{#identity_maximum\}

```ts
identity_maximum?: string;
```

Defined in: [packages/rxdb-adapter-pglite/src/pglite.interface.ts:153](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/pglite.interface.ts#L153)

Maximum value of the identity column

***

### identity\_minimum? \{#identity_minimum\}

```ts
identity_minimum?: string;
```

Defined in: [packages/rxdb-adapter-pglite/src/pglite.interface.ts:155](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/pglite.interface.ts#L155)

Minimum value of the identity column

***

### identity\_start? \{#identity_start\}

```ts
identity_start?: string;
```

Defined in: [packages/rxdb-adapter-pglite/src/pglite.interface.ts:149](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/pglite.interface.ts#L149)

Start value of the identity column

***

### interval\_precision? \{#interval_precision\}

```ts
interval_precision?: number;
```

Defined in: [packages/rxdb-adapter-pglite/src/pglite.interface.ts:107](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/pglite.interface.ts#L107)

Interval precision

***

### interval\_type? \{#interval_type\}

```ts
interval_type?: string;
```

Defined in: [packages/rxdb-adapter-pglite/src/pglite.interface.ts:105](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/pglite.interface.ts#L105)

Interval type

***

### is\_generated \{#is_generated\}

```ts
is_generated: string;
```

Defined in: [packages/rxdb-adapter-pglite/src/pglite.interface.ts:159](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/pglite.interface.ts#L159)

Whether the column is generated

***

### is\_identity \{#is_identity\}

```ts
is_identity: string;
```

Defined in: [packages/rxdb-adapter-pglite/src/pglite.interface.ts:145](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/pglite.interface.ts#L145)

Whether the column is an identity column

***

### is\_nullable \{#is_nullable\}

```ts
is_nullable: "YES" | "NO";
```

Defined in: [packages/rxdb-adapter-pglite/src/pglite.interface.ts:89](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/pglite.interface.ts#L89)

Whether the column can be NULL

***

### is\_self\_referencing \{#is_self_referencing\}

```ts
is_self_referencing: string;
```

Defined in: [packages/rxdb-adapter-pglite/src/pglite.interface.ts:143](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/pglite.interface.ts#L143)

Whether it is self-referencing

***

### is\_updatable \{#is_updatable\}

```ts
is_updatable: string;
```

Defined in: [packages/rxdb-adapter-pglite/src/pglite.interface.ts:163](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/pglite.interface.ts#L163)

Whether it is updatable

***

### maximum\_cardinality? \{#maximum_cardinality\}

```ts
maximum_cardinality?: number;
```

Defined in: [packages/rxdb-adapter-pglite/src/pglite.interface.ts:139](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/pglite.interface.ts#L139)

Maximum cardinality

***

### numeric\_precision? \{#numeric_precision\}

```ts
numeric_precision?: number;
```

Defined in: [packages/rxdb-adapter-pglite/src/pglite.interface.ts:97](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/pglite.interface.ts#L97)

Precision of a numeric type

***

### numeric\_precision\_radix? \{#numeric_precision_radix\}

```ts
numeric_precision_radix?: number;
```

Defined in: [packages/rxdb-adapter-pglite/src/pglite.interface.ts:99](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/pglite.interface.ts#L99)

Radix of the numeric precision

***

### numeric\_scale? \{#numeric_scale\}

```ts
numeric_scale?: number;
```

Defined in: [packages/rxdb-adapter-pglite/src/pglite.interface.ts:101](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/pglite.interface.ts#L101)

Scale of a numeric type

***

### ordinal\_position \{#ordinal_position\}

```ts
ordinal_position: number;
```

Defined in: [packages/rxdb-adapter-pglite/src/pglite.interface.ts:85](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/pglite.interface.ts#L85)

Ordinal position of the column within the table

***

### scope\_catalog? \{#scope_catalog\}

```ts
scope_catalog?: string;
```

Defined in: [packages/rxdb-adapter-pglite/src/pglite.interface.ts:133](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/pglite.interface.ts#L133)

Scope catalog

***

### scope\_name? \{#scope_name\}

```ts
scope_name?: string;
```

Defined in: [packages/rxdb-adapter-pglite/src/pglite.interface.ts:137](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/pglite.interface.ts#L137)

Scope name

***

### scope\_schema? \{#scope_schema\}

```ts
scope_schema?: string;
```

Defined in: [packages/rxdb-adapter-pglite/src/pglite.interface.ts:135](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/pglite.interface.ts#L135)

Scope schema

***

### table\_catalog \{#table_catalog\}

```ts
table_catalog: string;
```

Defined in: [packages/rxdb-adapter-pglite/src/pglite.interface.ts:77](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/pglite.interface.ts#L77)

Database catalog name

***

### table\_name \{#table_name\}

```ts
table_name: string;
```

Defined in: [packages/rxdb-adapter-pglite/src/pglite.interface.ts:81](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/pglite.interface.ts#L81)

Table name

***

### table\_schema \{#table_schema\}

```ts
table_schema: string;
```

Defined in: [packages/rxdb-adapter-pglite/src/pglite.interface.ts:79](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/pglite.interface.ts#L79)

Database schema name

***

### udt\_catalog \{#udt_catalog\}

```ts
udt_catalog: string;
```

Defined in: [packages/rxdb-adapter-pglite/src/pglite.interface.ts:127](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/pglite.interface.ts#L127)

User-defined type catalog

***

### udt\_name \{#udt_name\}

```ts
udt_name: string;
```

Defined in: [packages/rxdb-adapter-pglite/src/pglite.interface.ts:131](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/pglite.interface.ts#L131)

User-defined type name

***

### udt\_schema \{#udt_schema\}

```ts
udt_schema: string;
```

Defined in: [packages/rxdb-adapter-pglite/src/pglite.interface.ts:129](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/pglite.interface.ts#L129)

User-defined type schema
