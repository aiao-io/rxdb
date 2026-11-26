# FieldTreeNode

Defined in: [packages/rxdb-model/src/query-builder/utils/field-tree.ts:30](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/utils/field-tree.ts#L30)

Field tree node (used by CascadeSelect)

## Description

Converts the flat FieldMetadata[] into a tree structure so that the CascadeSelect component can display nested fields in a cascade.

## Properties

### children? \{#children\}

```ts
children?: FieldTreeNode[];
```

Defined in: [packages/rxdb-model/src/query-builder/utils/field-tree.ts:42](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/utils/field-tree.ts#L42)

Child nodes

---

### description? \{#description\}

```ts
description?: string;
```

Defined in: [packages/rxdb-model/src/query-builder/utils/field-tree.ts:44](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/utils/field-tree.ts#L44)

Field description

---

### displayName \{#displayname\}

```ts
displayName: string;
```

Defined in: [packages/rxdb-model/src/query-builder/utils/field-tree.ts:36](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/utils/field-tree.ts#L36)

Display name

---

### enum? \{#enum\}

```ts
enum?: unknown[];
```

Defined in: [packages/rxdb-model/src/query-builder/utils/field-tree.ts:48](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/utils/field-tree.ts#L48)

Enum values

---

### isExistsOption? \{#isexistsoption\}

```ts
isExistsOption?: boolean;
```

Defined in: [packages/rxdb-model/src/query-builder/utils/field-tree.ts:52](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/utils/field-tree.ts#L52)

Whether it is an existence-check option (used to resolve duplicate key issues)

---

### isNullCheckOption? \{#isnullcheckoption\}

```ts
isNullCheckOption?: boolean;
```

Defined in: [packages/rxdb-model/src/query-builder/utils/field-tree.ts:54](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/utils/field-tree.ts#L54)

Whether it is a null-check option (whole-value null query of keyValue fields)

---

### isRelation \{#isrelation\}

```ts
isRelation: boolean;
```

Defined in: [packages/rxdb-model/src/query-builder/utils/field-tree.ts:40](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/utils/field-tree.ts#L40)

Whether it is a relation field

---

### label \{#label\}

```ts
label: string;
```

Defined in: [packages/rxdb-model/src/query-builder/utils/field-tree.ts:32](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/utils/field-tree.ts#L32)

Field name at the current level

---

### relationFields? \{#relationfields\}

```ts
relationFields?: FieldMetadata[];
```

Defined in: [packages/rxdb-model/src/query-builder/utils/field-tree.ts:50](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/utils/field-tree.ts#L50)

Field list of the relation target entity (used for EXISTS subqueries)

---

### required? \{#required\}

```ts
required?: boolean;
```

Defined in: [packages/rxdb-model/src/query-builder/utils/field-tree.ts:46](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/utils/field-tree.ts#L46)

Whether it is required

---

### type \{#type\}

```ts
type: PropertyType;
```

Defined in: [packages/rxdb-model/src/query-builder/utils/field-tree.ts:38](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/utils/field-tree.ts#L38)

Field type

---

### value \{#value\}

```ts
value: string;
```

Defined in: [packages/rxdb-model/src/query-builder/utils/field-tree.ts:34](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/utils/field-tree.ts#L34)

Full path (used as the selected value)
