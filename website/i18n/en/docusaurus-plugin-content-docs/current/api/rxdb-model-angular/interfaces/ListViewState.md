# ListViewState

Defined in: packages/rxdb-model/dist/entity-list/list-view.d.ts:7

Field configuration, query ordering and single-field grouping of the entity list.

## Properties

### fieldOrder \{#fieldorder\}

```ts
fieldOrder: string[];
```

Defined in: packages/rxdb-model/dist/entity-list/list-view.d.ts:9

The field order specified by the user; the remaining fields are appended in model declaration order.

***

### groupBy \{#groupby\}

```ts
groupBy: string | null;
```

Defined in: packages/rxdb-model/dist/entity-list/list-view.d.ts:15

The grouping field; null means flat display.

***

### hiddenFields \{#hiddenfields\}

```ts
hiddenFields: string[];
```

Defined in: packages/rxdb-model/dist/entity-list/list-view.d.ts:11

Hidden data fields; the action column and selection column are always kept.

***

### sorts \{#sorts\}

```ts
sorts: OrderBy<string>[];
```

Defined in: packages/rxdb-model/dist/entity-list/list-view.d.ts:13

The query ordering rules in priority order.
