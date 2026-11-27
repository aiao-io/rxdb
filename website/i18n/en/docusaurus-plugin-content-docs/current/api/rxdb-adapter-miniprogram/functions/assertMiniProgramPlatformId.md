# assertMiniProgramPlatformId()

```ts
function assertMiniProgramPlatformId(value): asserts value is 'wechat' | 'douyin' | 'alipay';
```

Defined in: [packages/rxdb-adapter-miniprogram/src/host.ts:77](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-miniprogram/src/host.ts#L77)

Judges the platform id without needing a host: registered ones pass, unregistered ones throw directly. The host path ([resolveMiniProgramHost](resolveMiniProgramHost.md),
the runtime precheck, the VFS) uses the same judgment, so error messages match verbatim.

For callers that cannot construct a host yet, e.g. an app branching on the build platform judging the Taro platform name directly, with the rejection path for unregistered ones.

## Parameters

| Parameter | Type      | Description              |
| --------- | --------- | ------------------------ |
| `value`   | `unknown` | The platform id to judge |

## Returns

asserts value is "wechat" \| "douyin" \| "alipay"

## Throws

[MiniProgramUnsupportedPlatformError](../classes/MiniProgramUnsupportedPlatformError.md) for platforms judged `unsupported` by the feasibility matrix, carrying the blocking items and the judged section

## Throws

[MiniProgramUnknownPlatformError](../classes/MiniProgramUnknownPlatformError.md) for all other unregistered values
