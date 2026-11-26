# AdminShellProviderProps

Defined in: [types.ts:5](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-vue/src/types.ts#L5)

Props of [AdminShellProvider](../variables/AdminShellProvider.md).

## Properties

### shell \{#shell\}

```ts
readonly shell: AdminShell<Component>;
```

Defined in: [types.ts:11](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-vue/src/types.ts#L11)

The shell created by `createAdminShell`, with icon type as Vue components.
Not replaceable during mount (add a `key` to the Provider to rebuild when a replacement is needed); the shell is internally a class instance with `#private` fields —
do not put it into `ref()` / `reactive()` (a deep proxy cannot read private fields); use `shallowRef` or `markRaw` when reactive holding is needed.
