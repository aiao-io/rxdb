# AlipayMiniProgramHostOptions

Defined in: [packages/rxdb-adapter-miniprogram/src/hosts/alipay.ts:22](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-miniprogram/src/hosts/alipay.ts#L22)

Parameters of [createAlipayMiniProgramHost](../functions/createAlipayMiniProgramHost.md).

## Properties

### randomWorker \{#randomworker\}

```ts
readonly randomWorker: AlipayRandomWorker;
```

Defined in: [packages/rxdb-adapter-miniprogram/src/hosts/alipay.ts:29](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-miniprogram/src/hosts/alipay.ts#L29)

The Worker running the bundled `alipay-random-worker.js`: the logic layer has no secure random source at all; only Workers have `crypto.getRandomValues`.

Created via `my.createWorker('workers/index.js', { useExperimentalWorker: true })`;
declare the directory under `workers` in `app.json`, and skip transpilation in `mini.project.json`'s `transpile.script.ignore`.

***

### runtimeGlobal? \{#runtimeglobal\}

```ts
readonly runtimeGlobal?: typeof globalThis;
```

Defined in: [packages/rxdb-adapter-miniprogram/src/hosts/alipay.ts:40](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-miniprogram/src/hosts/alipay.ts#L40)

The real global object; see [MiniProgramHost.runtimeGlobal](MiniProgramHost.md#runtimeglobal); when absent, the environment's `globalThis` is used if present (iOS real devices),
otherwise (developer tools simulator) it is recovered through a getter on `Object.prototype`.

***

### webAssembly \{#webassembly\}

```ts
readonly webAssembly: AlipayStandardWasmApi | undefined;
```

Defined in: [packages/rxdb-adapter-miniprogram/src/hosts/alipay.ts:35](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-miniprogram/src/hosts/alipay.ts#L35)

The logic layer's standard `WebAssembly`; pass `undefined` when it cannot be obtained, and the runtime bootstrap reports the missing `logic-layer-webassembly`.

Passed explicitly rather than the host reading the free variable: when the logic layer lacks this global, reading it throws a `ReferenceError` directly.
