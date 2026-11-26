# MINI_PROGRAM_PLATFORM_IDS

```ts
const MINI_PROGRAM_PLATFORM_IDS: readonly ["wechat", "douyin", "alipay"];
```

Defined in: [packages/rxdb-adapter-miniprogram/src/mini-program.interface.ts:52](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-miniprogram/src/mini-program.interface.ts#L52)

The registered mini program platform ids.

Only platforms judged `supported` by the feasibility matrix and with an implemented host enter this table;
unregistered ids are always rejected as unknown platforms, with no fallback to the WeChat global.
