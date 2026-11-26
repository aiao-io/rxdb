# LocalRxDBAdapter

```ts
type LocalRxDBAdapter = IRxDBAdapter & RxDBAdapterLocalBase;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:363](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L363)

The complete shape of a local adapter: the interface contract + the local base-class capabilities.

## Remarks

The object emitted by the `localAdapter$` branch satisfies both at once, and callers always mix members from the two
sides, so the "intersection" is the real type on this chain, not either half.

Naming it instead of rewriting `IRxDBAdapter & RxDBAdapterLocalBase` in every signature saves more than twenty
copy-pastes, but there is also a hard compile-time reason: this intersection propagates across packages through an
**inferred** return type, and an anonymous intersection cannot be named through `@aiao/rxdb` when downstream packages
emit declarations — the `@aiao/source` condition resolves the bare specifier to `src/index.ts`, so the emitter falls
back to a relative path pointing into `packages/rxdb/src/`, dragging core-package source into the downstream
compilation (ng-packagr enforces `rootDir` per entry point and immediately reports TS6059). A named alias gives the
emitter a symbol that can be named through the barrel, and the escape no longer happens.
