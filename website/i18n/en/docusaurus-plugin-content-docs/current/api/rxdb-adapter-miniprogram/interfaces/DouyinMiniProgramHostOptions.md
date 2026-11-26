# DouyinMiniProgramHostOptions

Defined in: [packages/rxdb-adapter-miniprogram/src/hosts/douyin.ts:27](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-miniprogram/src/hosts/douyin.ts#L27)

Optional parameters of [createDouyinMiniProgramHost](../functions/createDouyinMiniProgramHost.md).

## Properties

### runtimeGlobal? \{#runtimeglobal\}

```ts
readonly runtimeGlobal?: typeof globalThis;
```

Defined in: [packages/rxdb-adapter-miniprogram/src/hosts/douyin.ts:34](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-miniprogram/src/hosts/douyin.ts#L34)

The real global object; see [MiniProgramHost.runtimeGlobal](MiniProgramHost.md#runtimeglobal).

Inside a Douyin page module `globalThis` is `undefined`; obtain it in non-strict code with `(function () { return this; })()` and pass it in;
omit it when the environment's `globalThis` is usable as-is.
