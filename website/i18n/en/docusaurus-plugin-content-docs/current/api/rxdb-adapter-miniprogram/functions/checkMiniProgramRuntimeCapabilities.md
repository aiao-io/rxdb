# checkMiniProgramRuntimeCapabilities()

```ts
function checkMiniProgramRuntimeCapabilities(options): readonly MiniProgramRuntimeCapability[];
```

Defined in: [packages/rxdb-adapter-miniprogram/src/runtime-capabilities.ts:103](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-miniprogram/src/runtime-capabilities.ts#L103)

Checks the capabilities required to run the full RxDB/wa-sqlite stack in a mini program logic layer.

Platform-specific capability names come from the host (`WXWebAssembly.instantiate` / `wx.*` for WeChat);
an unknown platform id throws `MiniProgramUnknownPlatformError` directly.

## Parameters

| Parameter | Type                                                                                            |
| --------- | ----------------------------------------------------------------------------------------------- |
| `options` | [`MiniProgramRuntimeCapabilityOptions`](../type-aliases/MiniProgramRuntimeCapabilityOptions.md) |

## Returns

readonly [`MiniProgramRuntimeCapability`](../interfaces/MiniProgramRuntimeCapability.md)[]
