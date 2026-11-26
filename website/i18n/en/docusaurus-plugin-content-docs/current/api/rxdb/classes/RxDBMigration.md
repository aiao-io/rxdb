# RxDBMigration

Defined in: [packages/rxdb/src/system/migration.ts:374](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/migration.ts#L374)

Database migration record

Records the execution history of database migration scripts. This class captures the key information of each database migration,
including the migration name and execution time, ensuring that migration scripts are not executed repeatedly,
and provides the ability to track migration history.

## Constructors

### Constructor

```ts
new RxDBMigration(): RxDBMigration;
```

#### Returns

`RxDBMigration`

## Properties

### executedAt \{#executedat\}

```ts
executedAt: Date;
```

Defined in: [packages/rxdb/src/system/migration.ts:385](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/migration.ts#L385)

Execution time

#### Default

```ts
new Date();
```

---

### id \{#id\}

```ts
id: number;
```

Defined in: [packages/rxdb/src/system/migration.ts:380](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/migration.ts#L380)

id

---

### name \{#name\}

```ts
name: string;
```

Defined in: [packages/rxdb/src/system/migration.ts:389](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/migration.ts#L389)

Name

---

### remove \{#remove\}

```ts
remove: () => Promise<RxDBMigration>;
```

Defined in: [packages/rxdb/src/system/migration.ts:446](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/migration.ts#L446)

Delete

#### Returns

`Promise`&lt;`RxDBMigration`&gt;

---

### reset \{#reset\}

```ts
reset: () => void;
```

Defined in: [packages/rxdb/src/system/migration.ts:450](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/migration.ts#L450)

Reset data

#### Returns

`void`

---

### save \{#save\}

```ts
save: () => Promise<RxDBMigration>;
```

Defined in: [packages/rxdb/src/system/migration.ts:454](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/migration.ts#L454)

Save

#### Returns

`Promise`&lt;`RxDBMigration`&gt;

---

### \[ENTITY\_STATIC\_TYPES\] \{#entity_static_types\}

```ts
static [ENTITY_STATIC_TYPES]: RxDBMigrationStaticTypes;
```

Defined in: [packages/rxdb/src/system/migration.ts:375](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/migration.ts#L375)

---

### count \{#count\}

```ts
static count: (options) => Observable<number>;
```

Defined in: [packages/rxdb/src/system/migration.ts:395](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/migration.ts#L395)

count query

#### Parameters

| Parameter | Type                                                                                                                                                   | Description   |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------- |
| `options` | [`CountOptions`](../interfaces/CountOptions.md)&lt;_typeof_ `RxDBMigration`, [`RxDBMigrationRuleGroup`](../type-aliases/RxDBMigrationRuleGroup.md)&gt; | Query options |

#### Returns

`Observable`&lt;`number`&gt;

---

### find \{#find\}

```ts
static find: (options) => Observable<RxDBMigration[]>;
```

Defined in: [packages/rxdb/src/system/migration.ts:401](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/migration.ts#L401)

find query

#### Parameters

| Parameter | Type                                                                                                                                                                                                                              | Description   |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| `options` | [`FindOptions`](../interfaces/FindOptions.md)&lt;_typeof_ `RxDBMigration`, [`RxDBMigrationRuleGroup`](../type-aliases/RxDBMigrationRuleGroup.md), [`RxDBMigrationOrderByField`](../type-aliases/RxDBMigrationOrderByField.md)&gt; | Query options |

#### Returns

`Observable`&lt;`RxDBMigration`[]&gt;

---

### findAll \{#findall\}

```ts
static findAll: (options) => Observable<RxDBMigration[]>;
```

Defined in: [packages/rxdb/src/system/migration.ts:409](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/migration.ts#L409)

findAll query

#### Parameters

| Parameter | Type                                                                                                                                                                                                                                    | Description   |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| `options` | [`FindAllOptions`](../interfaces/FindAllOptions.md)&lt;_typeof_ `RxDBMigration`, [`RxDBMigrationRuleGroup`](../type-aliases/RxDBMigrationRuleGroup.md), [`RxDBMigrationOrderByField`](../type-aliases/RxDBMigrationOrderByField.md)&gt; | Query options |

#### Returns

`Observable`&lt;`RxDBMigration`[]&gt;

---

### findByCursor \{#findbycursor\}

```ts
static findByCursor: (options) => Observable<RxDBMigration[]>;
```

Defined in: [packages/rxdb/src/system/migration.ts:417](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/migration.ts#L417)

findByCursor query

#### Parameters

| Parameter | Type                                                                                                                                                                                                                                              | Description   |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| `options` | [`FindByCursorOptions`](../interfaces/FindByCursorOptions.md)&lt;_typeof_ `RxDBMigration`, [`RxDBMigrationRuleGroup`](../type-aliases/RxDBMigrationRuleGroup.md), [`RxDBMigrationOrderByField`](../type-aliases/RxDBMigrationOrderByField.md)&gt; | Query options |

#### Returns

`Observable`&lt;`RxDBMigration`[]&gt;

---

### findOne \{#findone\}

```ts
static findOne: (options) => Observable<RxDBMigration | null>;
```

Defined in: [packages/rxdb/src/system/migration.ts:425](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/migration.ts#L425)

findOne query

#### Parameters

| Parameter | Type                                                                                                                                                                                                                                    | Description   |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| `options` | [`FindOneOptions`](../interfaces/FindOneOptions.md)&lt;_typeof_ `RxDBMigration`, [`RxDBMigrationRuleGroup`](../type-aliases/RxDBMigrationRuleGroup.md), [`RxDBMigrationOrderByField`](../type-aliases/RxDBMigrationOrderByField.md)&gt; | Query options |

#### Returns

`Observable`&lt;`RxDBMigration` \| `null`&gt;

---

### findOneOrFail \{#findoneorfail\}

```ts
static findOneOrFail: (options) => Observable<RxDBMigration>;
```

Defined in: [packages/rxdb/src/system/migration.ts:433](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/migration.ts#L433)

findOneOrFail query

#### Parameters

| Parameter | Type                                                                                                                                                                                                                                                | Description   |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| `options` | [`FindOneOrFailOptions`](../interfaces/FindOneOrFailOptions.md)&lt;_typeof_ `RxDBMigration`, [`RxDBMigrationRuleGroup`](../type-aliases/RxDBMigrationRuleGroup.md), [`RxDBMigrationOrderByField`](../type-aliases/RxDBMigrationOrderByField.md)&gt; | Query options |

#### Returns

`Observable`&lt;`RxDBMigration`&gt;

---

### get \{#get\}

```ts
static get: (options) => Observable<RxDBMigration>;
```

Defined in: [packages/rxdb/src/system/migration.ts:441](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/migration.ts#L441)

get query

#### Parameters

| Parameter | Type     | Description   |
| --------- | -------- | ------------- |
| `options` | `number` | Query options |

#### Returns

`Observable`&lt;`RxDBMigration`&gt;
