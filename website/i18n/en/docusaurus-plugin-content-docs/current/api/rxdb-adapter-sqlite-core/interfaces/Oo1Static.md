# Oo1Static

Defined in: [packages/rxdb-adapter-sqlite-core/src/oo1-types.ts:73](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/oo1-types.ts#L73)

Minimal contract of the sqlite-wasm module's exported object: the capi and oo1 namespaces plus version information.

## Properties

### capi \{#capi\}

```ts
capi: Oo1Capi;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/oo1-types.ts:74](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/oo1-types.ts#L74)

---

### config? \{#config\}

```ts
config?: object;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/oo1-types.ts:75](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/oo1-types.ts#L75)

#### error

```ts
error: (...args) => void;
```

##### Parameters

| Parameter | Type        |
| --------- | ----------- |
| ...`args` | `unknown`[] |

##### Returns

`void`

#### warn

```ts
warn: (...args) => void;
```

##### Parameters

| Parameter | Type        |
| --------- | ----------- |
| ...`args` | `unknown`[] |

##### Returns

`void`

---

### oo1 \{#oo1\}

```ts
oo1: object;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/oo1-types.ts:80](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/oo1-types.ts#L80)

#### DB

```ts
DB: new (filename?, flags?, vfs?) => Oo1Database;
```

##### Parameters

| Parameter   | Type     |
| ----------- | -------- |
| `filename?` | `string` |
| `flags?`    | `string` |
| `vfs?`      | `string` |

##### Returns

[`Oo1Database`](Oo1Database.md)

#### OpfsDb?

```ts
OpfsDb?: new (filename?, flags?) => Oo1Database;
```

##### Parameters

| Parameter   | Type     |
| ----------- | -------- |
| `filename?` | `string` |
| `flags?`    | `string` |

##### Returns

[`Oo1Database`](Oo1Database.md)

---

### opfs? \{#opfs\}

```ts
opfs?: unknown;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/oo1-types.ts:79](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/oo1-types.ts#L79)

---

### version \{#version\}

```ts
version: object;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/oo1-types.ts:84](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/oo1-types.ts#L84)

#### downloadVersion

```ts
downloadVersion: number;
```

#### libVersion

```ts
libVersion: string;
```

#### libVersionNumber

```ts
libVersionNumber: number;
```

#### sourceId

```ts
sourceId: string;
```
