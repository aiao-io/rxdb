# RxDBPluginDependency

```ts
type RxDBPluginDependency = 'adapter:local' | 'adapter:remote' | `plugin:${Uncapitalize<string>}`;
```

Defined in: [packages/rxdb/src/rxdb-plugin.ts:51](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-plugin.ts#L51)

Dependencies that a plugin can declare, a **closed set of values**.

## Remarks

There are only three kinds of values: a local adapter, a remote adapter, and another plugin referenced by name.
The reason it is deliberately not open to arbitrary strings (US-015 INV-1): the dependency key is both a
compile-time contract and a runtime lookup key. Once opened up, a misspelled key shows up on both sides only as
"the dependency is never satisfied" — the plugin silently fails to install, and the caller gets no compile-time
hint at all.

The `plugin:` prefix is required; the bare name `'search'` and the capitalized `'plugin:Search'` both fail to compile:
the former collides with built-in resource keys that may be added in the future, and the latter is inconsistent with
the `Uncapitalize<string>` of [IRxDBPlugin.name](../interfaces/IRxDBPlugin.md#name), so the lookup is guaranteed to miss.

There are two readiness criteria, and both mean "usable" rather than "present":

- `adapter:*` — the adapter's bootstrap chain (migration, table creation, index reconcile) has finished
- `plugin:*` — the plugin has entered `active`
