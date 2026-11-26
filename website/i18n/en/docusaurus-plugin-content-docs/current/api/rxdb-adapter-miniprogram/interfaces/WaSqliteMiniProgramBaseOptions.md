# WaSqliteMiniProgramBaseOptions

Defined in: [packages/rxdb-adapter-miniprogram/src/mini-program.interface.ts:205](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-miniprogram/src/mini-program.interface.ts#L205)

Adapter config independent of how the host is injected.

## Extends

- [`IRxDBAdapterOptions`](../../rxdb/type-aliases/IRxDBAdapterOptions.md)

## Extended by

- [`WaSqliteMiniProgramHostOptions`](WaSqliteMiniProgramHostOptions.md)
- [`WaSqliteMiniProgramOptions`](WaSqliteMiniProgramOptions.md)

## Properties

### cacheSizeKb? \{#cachesizekb\}

```ts
cacheSizeKb?: number;
```

Defined in: [packages/rxdb-adapter-miniprogram/src/mini-program.interface.ts:215](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-miniprogram/src/mini-program.interface.ts#L215)

The SQLite page cache, in KB.

***

### databaseRoot? \{#databaseroot\}

```ts
databaseRoot?: string;
```

Defined in: [packages/rxdb-adapter-miniprogram/src/mini-program.interface.ts:213](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-miniprogram/src/mini-program.interface.ts#L213)

The database file directory. Defaults to `${host.userDataPath}/rxdb-wa-sqlite` (`wx.env.USER_DATA_PATH` for WeChat).

***

### moduleFactory \{#modulefactory\}

```ts
moduleFactory: WaSqliteModuleFactory;
```

Defined in: [packages/rxdb-adapter-miniprogram/src/mini-program.interface.ts:207](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-miniprogram/src/mini-program.interface.ts#L207)

The synchronous wa-sqlite module factory, obtained from `loadSubframeModuleFactory()`.

***

### repositories? \{#repositories\}

```ts
repositories?: Record<string, WaSqliteMiniProgramRepositoryConstructor<RepositoryBase<AnyEntityType>>>;
```

Defined in: [packages/rxdb-adapter-miniprogram/src/mini-program.interface.ts:217](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-miniprogram/src/mini-program.interface.ts#L217)

Overrides the default repository implementations.

***

### wasmPath? \{#wasmpath\}

```ts
wasmPath?: string;
```

Defined in: [packages/rxdb-adapter-miniprogram/src/mini-program.interface.ts:211](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-miniprogram/src/mini-program.interface.ts#L211)

The in-package wasm path. Mini program WASM runtimes do not accept URLs or ArrayBuffers.

***

### wasmRuntime \{#wasmruntime\}

```ts
wasmRuntime: MiniProgramWasmRuntime;
```

Defined in: [packages/rxdb-adapter-miniprogram/src/mini-program.interface.ts:209](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-miniprogram/src/mini-program.interface.ts#L209)

The mini program WASM runtime: the global `WXWebAssembly` for WeChat, `TTWebAssembly` for Douyin.
