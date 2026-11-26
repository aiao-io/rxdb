# FieldTreeNode

Defined in: packages/rxdb-model/dist/query-builder/utils/field-tree.d.ts:10

Field tree node (used for CascadeSelect)

## Description

Converts a flat FieldMetadata[] into a tree structure,
so that the CascadeSelect component can display nested fields in cascades.

## Properties

### children? \{#children\}

```ts
children?: FieldTreeNode[];
```

Defined in: packages/rxdb-model/dist/query-builder/utils/field-tree.d.ts:22

Child nodes

***

### description? \{#description\}

```ts
description?: string;
```

Defined in: packages/rxdb-model/dist/query-builder/utils/field-tree.d.ts:24

Field description

***

### displayName \{#displayname\}

```ts
displayName: string;
```

Defined in: packages/rxdb-model/dist/query-builder/utils/field-tree.d.ts:16

Display name

***

### enum? \{#enum\}

```ts
enum?: unknown[];
```

Defined in: packages/rxdb-model/dist/query-builder/utils/field-tree.d.ts:28

Enum values

***

### isExistsOption? \{#isexistsoption\}

```ts
isExistsOption?: boolean;
```

Defined in: packages/rxdb-model/dist/query-builder/utils/field-tree.d.ts:32

Whether it is an existence-check option (used to solve duplicate key problems)

***

### isNullCheckOption? \{#isnullcheckoption\}

```ts
isNullCheckOption?: boolean;
```

Defined in: packages/rxdb-model/dist/query-builder/utils/field-tree.d.ts:34

Whether it is a null-check option (the whole-value null query of a keyValue field)

***

### isRelation \{#isrelation\}

```ts
isRelation: boolean;
```

Defined in: packages/rxdb-model/dist/query-builder/utils/field-tree.d.ts:20

Whether it is a relation field

***

### label \{#label\}

```ts
label: string;
```

Defined in: packages/rxdb-model/dist/query-builder/utils/field-tree.d.ts:12

The field name at the current level

***

### relationFields? \{#relationfields\}

```ts
relationFields?: FieldMetadata[];
```

Defined in: packages/rxdb-model/dist/query-builder/utils/field-tree.d.ts:30

Field list of the relation target entity (used for EXISTS subqueries)

***

### required? \{#required\}

```ts
required?: boolean;
```

Defined in: packages/rxdb-model/dist/query-builder/utils/field-tree.d.ts:26

Whether it is required

***

### type \{#type\}

```ts
type: PropertyType;
```

Defined in: packages/rxdb-model/dist/query-builder/utils/field-tree.d.ts:18

Field type

***

### value \{#value\}

```ts
value: string;
```

Defined in: packages/rxdb-model/dist/query-builder/utils/field-tree.d.ts:14

Full path (used as the selected value)
