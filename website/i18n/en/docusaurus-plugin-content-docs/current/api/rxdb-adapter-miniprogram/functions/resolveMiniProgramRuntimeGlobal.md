# resolveMiniProgramRuntimeGlobal()

```ts
function resolveMiniProgramRuntimeGlobal(host): typeof globalThis;
```

Defined in: [packages/rxdb-adapter-miniprogram/src/runtime-global.ts:69](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-miniprogram/src/runtime-global.ts#L69)

Resolves the host's real global object: `host.runtimeGlobal` first, otherwise the environment's `globalThis`.

## Parameters

| Parameter | Type                                                  | Description           |
| --------- | ----------------------------------------------------- | --------------------- |
| `host`    | [`MiniProgramHost`](../interfaces/MiniProgramHost.md) | The mini program host |

## Returns

_typeof_ `globalThis`

The global object that runtime patches write to and capability prechecks read from

## Throws

Throws when neither is the current realm's global object, without degrading
