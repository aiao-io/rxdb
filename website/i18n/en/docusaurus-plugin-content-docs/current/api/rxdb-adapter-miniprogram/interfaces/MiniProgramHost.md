# MiniProgramHost

Defined in: [packages/rxdb-adapter-miniprogram/src/mini-program.interface.ts:87](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-miniprogram/src/mini-program.interface.ts#L87)

Platform-agnostic mini program host: synchronous files, user data directory, secure random source and platform id.

One implementation per platform; impersonating another platform with a global object that merely "looks like `wx`" is forbidden.
The WeChat implementation is `createWechatMiniProgramHost(wx)`, Douyin's is `createDouyinMiniProgramHost(tt)`,
and Alipay's is `createAlipayMiniProgramHost(my, options)`.

## Properties

### capabilityNames \{#capabilitynames\}

```ts
readonly capabilityNames: MiniProgramHostCapabilityNames;
```

Defined in: [packages/rxdb-adapter-miniprogram/src/mini-program.interface.ts:97](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-miniprogram/src/mini-program.interface.ts#L97)

The capability names used in prechecks.

***

### defaultWasmPath? \{#defaultwasmpath\}

```ts
readonly defaultWasmPath?: string;
```

Defined in: [packages/rxdb-adapter-miniprogram/src/mini-program.interface.ts:124](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-miniprogram/src/mini-program.interface.ts#L124)

The in-package wasm path used when `wasmPath` is not passed; defaults to [DEFAULT\_WASM\_PATH](../variables/DEFAULT_WASM_PATH.md), unset by WeChat.

#### Remarks

Douyin resolves relative paths against the current page directory, so only a code-package-root path starting with `/` loads from any page.

***

### displayName \{#displayname\}

```ts
readonly displayName: string;
```

Defined in: [packages/rxdb-adapter-miniprogram/src/mini-program.interface.ts:91](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-miniprogram/src/mini-program.interface.ts#L91)

The error prefix, e.g. `WeChat mini program`.

***

### fileLayout? \{#filelayout\}

```ts
readonly fileLayout?: MiniProgramFileLayout;
```

Defined in: [packages/rxdb-adapter-miniprogram/src/mini-program.interface.ts:117](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-miniprogram/src/mini-program.interface.ts#L117)

The storage layout; defaults to `{ kind: 'single' }`, unset by WeChat.

#### Remarks

When Douyin overwrites an existing file the old file still counts against the quota until the write succeeds, and whole-file flushes cap the database at about half the quota;
after hitting the quota there is no room even for a hot journal rollback, and the database can never be opened again; `chunked` only rewrites changed chunks and reserves rollback headroom.

***

### platform \{#platform\}

```ts
readonly platform: "wechat" | "douyin" | "alipay";
```

Defined in: [packages/rxdb-adapter-miniprogram/src/mini-program.interface.ts:89](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-miniprogram/src/mini-program.interface.ts#L89)

The platform id, which must be in [MINI\_PROGRAM\_PLATFORM\_IDS](../variables/MINI_PROGRAM_PLATFORM_IDS.md).

***

### runtimeGlobal? \{#runtimeglobal\}

```ts
readonly runtimeGlobal?: typeof globalThis;
```

Defined in: [packages/rxdb-adapter-miniprogram/src/mini-program.interface.ts:109](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-miniprogram/src/mini-program.interface.ts#L109)

The real global object; when absent, the environment's `globalThis` is used.

#### Remarks

Douyin page modules' wrapper functions shadow `globalThis` to `undefined`, and `global` is only an empty shell without built-ins;
only the `this` of a non-strict function is the real global object. The adapter is a strict-mode module and cannot obtain it,
so the caller must obtain it in non-strict code and inject it. Patches are installed there, so RxDB and wa-sqlite can read them through free variables.
If it is not the current realm's global object, it is rejected directly — no fallback to the environment.

***

### shortName \{#shortname\}

```ts
readonly shortName: string;
```

Defined in: [packages/rxdb-adapter-miniprogram/src/mini-program.interface.ts:93](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-miniprogram/src/mini-program.interface.ts#L93)

The platform short name used in file VFS errors, e.g. `WeChat`.

***

### userDataPath \{#userdatapath\}

```ts
readonly userDataPath: string | undefined;
```

Defined in: [packages/rxdb-adapter-miniprogram/src/mini-program.interface.ts:99](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-miniprogram/src/mini-program.interface.ts#L99)

The user data directory; `undefined` when the platform does not provide one, reported as missing by the precheck.

***

### wasmRuntimeName \{#wasmruntimename\}

```ts
readonly wasmRuntimeName: string;
```

Defined in: [packages/rxdb-adapter-miniprogram/src/mini-program.interface.ts:95](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-miniprogram/src/mini-program.interface.ts#L95)

The platform WASM runtime global name, e.g. `WXWebAssembly`.

## Methods

### getFileSystemManager() \{#getfilesystemmanager\}

```ts
getFileSystemManager(): 
  | MiniProgramFileSystemManager
  | undefined;
```

Defined in: [packages/rxdb-adapter-miniprogram/src/mini-program.interface.ts:126](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-miniprogram/src/mini-program.interface.ts#L126)

The synchronous file system; returns `undefined` when the platform does not provide one, reported as missing by the precheck.

#### Returns

  \| [`MiniProgramFileSystemManager`](MiniProgramFileSystemManager.md)
  \| `undefined`

***

### prepareRuntime()? \{#prepareruntime\}

```ts
prepareRuntime?(runtimeGlobal): Promise<void>;
```

Defined in: [packages/rxdb-adapter-miniprogram/src/mini-program.interface.ts:142](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-miniprogram/src/mini-program.interface.ts#L142)

Called once when bootstrapping the runtime, before the common polyfills are installed, to let the host fill in platform-specific gaps or detect connection dependencies; unset by WeChat and Douyin, set by Alipay.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `runtimeGlobal` | *typeof* `globalThis` | The already-resolved real global object |

#### Returns

`Promise`&lt;`void`&gt;

#### Remarks

Only semantic-preserving patching is allowed; if it cannot be done, reject, and the bootstrap fails accordingly — no degrading.

***

### requestRandomValues() \{#requestrandomvalues\}

```ts
requestRandomValues(length): Promise<Uint8Array<ArrayBufferLike>>;
```

Defined in: [packages/rxdb-adapter-miniprogram/src/mini-program.interface.ts:133](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-miniprogram/src/mini-program.interface.ts#L133)

Requests exactly `length` bytes of cryptographically secure random numbers from the platform; must reject if impossible, no degrading.

Returns a freshly allocated buffer each time; the host must not read or write it after handing it over: the runtime uses it directly as the random pool, hands out pieces and zeroes them.
Reusing a buffer that is still in use is detected as a contract violation and rejected.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `length` | `number` |

#### Returns

`Promise`&lt;`Uint8Array`&lt;`ArrayBufferLike`&gt;&gt;
