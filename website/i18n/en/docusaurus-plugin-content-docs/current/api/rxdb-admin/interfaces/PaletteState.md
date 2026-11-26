# PaletteState

Defined in: [palette/controller.ts:66](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/palette/controller.ts#L66)

The command palette state.

## Properties

### failed \{#failed\}

```ts
readonly failed: readonly string[];
```

Defined in: [palette/controller.ts:74](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/palette/controller.ts#L74)

The ids of the asynchronous sources whose search failed.

---

### groups \{#groups\}

```ts
readonly groups: PaletteGroup[];
```

Defined in: [palette/controller.ts:76](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/palette/controller.ts#L76)

The grouped results.

---

### loading \{#loading\}

```ts
readonly loading: boolean;
```

Defined in: [palette/controller.ts:72](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/palette/controller.ts#L72)

An asynchronous source is searching.

---

### mode \{#mode\}

```ts
readonly mode: "recent" | "results";
```

Defined in: [palette/controller.ts:82](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/palette/controller.ts#L82)

`recent`: recent usage / suggestions on an empty query; `results`: the query results.

---

### open \{#open\}

```ts
readonly open: boolean;
```

Defined in: [palette/controller.ts:68](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/palette/controller.ts#L68)

Whether it is open.

---

### query \{#query\}

```ts
readonly query: string;
```

Defined in: [palette/controller.ts:70](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/palette/controller.ts#L70)

The query text.

---

### selectedIndex \{#selectedindex\}

```ts
readonly selectedIndex: number;
```

Defined in: [palette/controller.ts:80](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/palette/controller.ts#L80)

The index of the selected entry.

---

### total \{#total\}

```ts
readonly total: number;
```

Defined in: [palette/controller.ts:78](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/palette/controller.ts#L78)

The total number of results.
