# DevToolsRxDB

```ts
type DevToolsRxDB = Pick<RxDB, 
  | "addEventListener"
  | "removeEventListener"
  | "disconnectAll"
  | "getAdapter"
  | "version"
  | "config"
  | "entityManager"> & object;
```

Defined in: [connector-types.ts:23](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/connector-types.ts#L23)

The subset of RxDB capabilities that DevTools actually uses.

## Type Declaration

### versionManager?

```ts
readonly versionManager?: DevToolsVersionManager;
```

Entry point for branch write operations; absent when the host has not installed `@aiao/rxdb-plugin-history`.

#### Remarks

**Optional is a fact, not leniency**: since US-025 phase C, the history / branch subsystem lives in
`@aiao/rxdb-plugin-history`, which the host `use()`s on its own. Not installed means no branch capability,
and the panel must truthfully report "unsupported" instead of misreporting "no branches at all" or silently swallowing commands.

## Remarks

`Pick` from the `RxDB` of `@aiao/rxdb` rather than copying another duck-typed interface in this package:
a copied `addEventListener(type: string, ...)` and a callback-only repository
contract are simply not the real generic API, which forced all three framework demos to use `as any` just to call [DevToolsConnector.init](../classes/DevToolsConnector.md#init),
and this package would get no compile-time signal when the upstream signature evolves.

`@aiao/rxdb` is a **peerDependency + type-only import**: the types are erased at compile time,
they do not enter the runtime bundle, and they add no installation-topology burden to devtools consumers.
