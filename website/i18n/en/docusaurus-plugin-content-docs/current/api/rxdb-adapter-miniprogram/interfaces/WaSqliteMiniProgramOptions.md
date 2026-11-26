# WaSqliteMiniProgramOptions

Defined in: [packages/rxdb-adapter-miniprogram/src/mini-program.interface.ts:227](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-miniprogram/src/mini-program.interface.ts#L227)

Config of the WeChat mini program wa-sqlite adapter (the WeChat convenience shape).

Kept as an interface so downstream code can continue to `extends` / `implements` it. For the platform-agnostic injection see
[WaSqliteMiniProgramHostOptions](WaSqliteMiniProgramHostOptions.md); the adapter and the client accept the union
[WaSqliteMiniProgramAdapterOptions](../type-aliases/WaSqliteMiniProgramAdapterOptions.md) of the two.

## Extends

- [`WaSqliteMiniProgramBaseOptions`](WaSqliteMiniProgramBaseOptions.md)

## Properties

### cacheSizeKb? \{#cachesizekb\}

```ts
cacheSizeKb?: number;
```

Defined in: [packages/rxdb-adapter-miniprogram/src/mini-program.interface.ts:215](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-miniprogram/src/mini-program.interface.ts#L215)

The SQLite page cache, in KB.

#### Inherited from

[`WaSqliteMiniProgramBaseOptions`](WaSqliteMiniProgramBaseOptions.md).[`cacheSizeKb`](WaSqliteMiniProgramBaseOptions.md#cachesizekb)

***

### databaseRoot? \{#databaseroot\}

```ts
databaseRoot?: string;
```

Defined in: [packages/rxdb-adapter-miniprogram/src/mini-program.interface.ts:213](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-miniprogram/src/mini-program.interface.ts#L213)

The database file directory. Defaults to `${host.userDataPath}/rxdb-wa-sqlite` (`wx.env.USER_DATA_PATH` for WeChat).

#### Inherited from

[`WaSqliteMiniProgramBaseOptions`](WaSqliteMiniProgramBaseOptions.md).[`databaseRoot`](WaSqliteMiniProgramBaseOptions.md#databaseroot)

***

### host? \{#host\}

```ts
host?: undefined;
```

Defined in: [packages/rxdb-adapter-miniprogram/src/mini-program.interface.ts:234](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-miniprogram/src/mini-program.interface.ts#L234)

Mutually exclusive with `wechat`.

***

### moduleFactory \{#modulefactory\}

```ts
moduleFactory: WaSqliteModuleFactory;
```

Defined in: [packages/rxdb-adapter-miniprogram/src/mini-program.interface.ts:207](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-miniprogram/src/mini-program.interface.ts#L207)

The synchronous wa-sqlite module factory, obtained from `loadSubframeModuleFactory()`.

#### Inherited from

[`WaSqliteMiniProgramBaseOptions`](WaSqliteMiniProgramBaseOptions.md).[`moduleFactory`](WaSqliteMiniProgramBaseOptions.md#modulefactory)

***

### repositories? \{#repositories\}

```ts
repositories?: Record<string, WaSqliteMiniProgramRepositoryConstructor<RepositoryBase<AnyEntityType>>>;
```

Defined in: [packages/rxdb-adapter-miniprogram/src/mini-program.interface.ts:217](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-miniprogram/src/mini-program.interface.ts#L217)

Overrides the default repository implementations.

#### Inherited from

[`WaSqliteMiniProgramBaseOptions`](WaSqliteMiniProgramBaseOptions.md).[`repositories`](WaSqliteMiniProgramBaseOptions.md#repositories)

***

### wasmPath? \{#wasmpath\}

```ts
wasmPath?: string;
```

Defined in: [packages/rxdb-adapter-miniprogram/src/mini-program.interface.ts:211](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-miniprogram/src/mini-program.interface.ts#L211)

The in-package wasm path. Mini program WASM runtimes do not accept URLs or ArrayBuffers.

#### Inherited from

[`WaSqliteMiniProgramBaseOptions`](WaSqliteMiniProgramBaseOptions.md).[`wasmPath`](WaSqliteMiniProgramBaseOptions.md#wasmpath)

***

### wasmRuntime \{#wasmruntime\}

```ts
wasmRuntime: MiniProgramWasmRuntime;
```

Defined in: [packages/rxdb-adapter-miniprogram/src/mini-program.interface.ts:209](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-miniprogram/src/mini-program.interface.ts#L209)

The mini program WASM runtime: the global `WXWebAssembly` for WeChat, `TTWebAssembly` for Douyin.

#### Inherited from

[`WaSqliteMiniProgramBaseOptions`](WaSqliteMiniProgramBaseOptions.md).[`wasmRuntime`](WaSqliteMiniProgramBaseOptions.md#wasmruntime)

***

### wechat \{#wechat\}

```ts
wechat: MiniProgramWechatApi;
```

Defined in: [packages/rxdb-adapter-miniprogram/src/mini-program.interface.ts:232](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-miniprogram/src/mini-program.interface.ts#L232)

The WeChat mini program global `wx`, a convenience shape for `host: createWechatMiniProgramHost(wx)`.
Injected explicitly, so the platform global is not hidden inside the library.
