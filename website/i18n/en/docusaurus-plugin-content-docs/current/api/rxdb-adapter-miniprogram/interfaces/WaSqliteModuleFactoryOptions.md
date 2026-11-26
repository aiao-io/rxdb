# WaSqliteModuleFactoryOptions

Defined in: [packages/rxdb-adapter-miniprogram/src/mini-program.interface.ts:184](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-miniprogram/src/mini-program.interface.ts#L184)

Initialization parameters passed to the mini program wa-sqlite glue.

## Methods

### instantiateWasm() \{#instantiatewasm\}

```ts
instantiateWasm(imports, receiveInstance): object;
```

Defined in: [packages/rxdb-adapter-miniprogram/src/mini-program.interface.ts:185](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-miniprogram/src/mini-program.interface.ts#L185)

#### Parameters

| Parameter         | Type                                                            |
| ----------------- | --------------------------------------------------------------- |
| `imports`         | `WebAssembly.Imports`                                           |
| `receiveInstance` | [`ReceiveWasmInstance`](../type-aliases/ReceiveWasmInstance.md) |

#### Returns

`object`

---

### locateFile() \{#locatefile\}

```ts
locateFile(path): string;
```

Defined in: [packages/rxdb-adapter-miniprogram/src/mini-program.interface.ts:186](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-miniprogram/src/mini-program.interface.ts#L186)

#### Parameters

| Parameter | Type     |
| --------- | -------- |
| `path`    | `string` |

#### Returns

`string`

---

### print() \{#print\}

```ts
print(message): void;
```

Defined in: [packages/rxdb-adapter-miniprogram/src/mini-program.interface.ts:187](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-miniprogram/src/mini-program.interface.ts#L187)

#### Parameters

| Parameter | Type     |
| --------- | -------- |
| `message` | `string` |

#### Returns

`void`

---

### printErr() \{#printerr\}

```ts
printErr(message): void;
```

Defined in: [packages/rxdb-adapter-miniprogram/src/mini-program.interface.ts:188](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-miniprogram/src/mini-program.interface.ts#L188)

#### Parameters

| Parameter | Type     |
| --------- | -------- |
| `message` | `string` |

#### Returns

`void`
