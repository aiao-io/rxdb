# MiniProgramHostSelection

```ts
type MiniProgramHostSelection =
  Pick<WaSqliteMiniProgramOptions, 'wechat' | 'host'> | Pick<WaSqliteMiniProgramHostOptions, 'wechat' | 'host'>;
```

Defined in: [packages/rxdb-adapter-miniprogram/src/mini-program.interface.ts:148](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-miniprogram/src/mini-program.interface.ts#L148)

How the host is injected: the WeChat convenience shape `wechat`, or the platform-agnostic `host` — exactly one of the two.
