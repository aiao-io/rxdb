# WaSqliteMiniProgramHostOptions

Defined in: [packages/rxdb-adapter-miniprogram/src/mini-program.interface.ts:238](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-miniprogram/src/mini-program.interface.ts#L238)

Adapter config that injects the host as a platform-agnostic [MiniProgramHost](MiniProgramHost.md).

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

### host \{#host\}

```ts
host: MiniProgramHost;
```

Defined in: [packages/rxdb-adapter-miniprogram/src/mini-program.interface.ts:240](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-miniprogram/src/mini-program.interface.ts#L240)

The platform-agnostic mini program host.

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

### wechat? \{#wechat\}

```ts
wechat?: undefined;
```

Defined in: [packages/rxdb-adapter-miniprogram/src/mini-program.interface.ts:242](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-miniprogram/src/mini-program.interface.ts#L242)

Mutually exclusive with `host`.
