# WaSqliteEmscriptenModule

Defined in: [packages/rxdb-adapter-miniprogram/src/mini-program.interface.ts:171](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-miniprogram/src/mini-program.interface.ts#L171)

The fields of the wa-sqlite Emscripten module used directly by the adapter and the VFS.

Only the minimal set exported by every target build is declared: `@subframe7536/sqlite-wasm`'s glue only attaches
`HEAPU8` / `HEAP32` to the module object (both are reassigned when memory grows),
while `HEAPU32` / `HEAPF64` exist only inside the glue closure and can only be accessed through `setValue`.

## Properties

### HEAP32 \{#heap32\}

```ts
readonly HEAP32: Int32Array;
```

Defined in: [packages/rxdb-adapter-miniprogram/src/mini-program.interface.ts:172](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-miniprogram/src/mini-program.interface.ts#L172)

---

### HEAPU8 \{#heapu8\}

```ts
readonly HEAPU8: Uint8Array<ArrayBuffer>;
```

Defined in: [packages/rxdb-adapter-miniprogram/src/mini-program.interface.ts:173](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-miniprogram/src/mini-program.interface.ts#L173)

## Methods

### \_sqlite3\_next\_stmt() \{#_sqlite3_next_stmt\}

```ts
_sqlite3_next_stmt(database, statement): number;
```

Defined in: [packages/rxdb-adapter-miniprogram/src/mini-program.interface.ts:174](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-miniprogram/src/mini-program.interface.ts#L174)

#### Parameters

| Parameter   | Type     |
| ----------- | -------- |
| `database`  | `number` |
| `statement` | `number` |

#### Returns

`number`

---

### setValue() \{#setvalue\}

```ts
setValue(
   pointer,
   value,
   type
): void;
```

Defined in: [packages/rxdb-adapter-miniprogram/src/mini-program.interface.ts:177](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-miniprogram/src/mini-program.interface.ts#L177)

#### Parameters

| Parameter | Type       |
| --------- | ---------- |
| `pointer` | `number`   |
| `value`   | `number`   |
| `type`    | `"double"` |

#### Returns

`void`

---

### stringToUTF8() \{#stringtoutf8\}

```ts
stringToUTF8(
   value,
   pointer,
   maximumBytes
): void;
```

Defined in: [packages/rxdb-adapter-miniprogram/src/mini-program.interface.ts:176](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-miniprogram/src/mini-program.interface.ts#L176)

#### Parameters

| Parameter      | Type     |
| -------------- | -------- |
| `value`        | `string` |
| `pointer`      | `number` |
| `maximumBytes` | `number` |

#### Returns

`void`

---

### UTF8ToString() \{#utf8tostring\}

```ts
UTF8ToString(pointer): string;
```

Defined in: [packages/rxdb-adapter-miniprogram/src/mini-program.interface.ts:175](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-miniprogram/src/mini-program.interface.ts#L175)

#### Parameters

| Parameter | Type     |
| --------- | -------- |
| `pointer` | `number` |

#### Returns

`string`
