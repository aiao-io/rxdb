---
sidebar_label: 'RxDBSource⟨T⟩'
---

# RxDBSource`<T>`

```ts
type RxDBSource<T> = T | Promise<T> | (() => T | Promise<T>);
```

Defined in: [rxdb-react/src/rxdb-react.tsx:28](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-react/src/rxdb-react.tsx#L28)

Database forms accepted by `RxDBProvider`: an instance, a Promise, or a factory returning either.

## Type Parameters

| Type Parameter                                                                   | Default type                         | Description   |
| -------------------------------------------------------------------------------- | ------------------------------------ | ------------- |
| <a id="type-parameter-t"></a> `T` _extends_ [`RxDB`](../../rxdb/classes/RxDB.md) | [`RxDB`](../../rxdb/classes/RxDB.md) | Database type |

## Remarks

The providers of the three framework packages (Angular / React / Vue) accept the **same** union type, with the same name — this is one of the landing points of the cross-framework symmetry rule: the same explanation of "how to hand the library to the framework" holds verbatim on all three sides, so users don't need to relearn it when switching frameworks.

Promises are allowed for scenarios like "candidates loaded via dynamic `import()`" (US-207 E11): the desktop branch must not be pulled into the web bundle by a static import, and `await import()` can only yield a Promise.

**A non-instance source must be a stable reference** (a module-level constant or the result of `useMemo`). Writing an inline arrow `db={() => setup()}` gives every render a new identity, so every render rebuilds the database — that is the inherent semantics of React dependency arrays, not something this package can cover for you.

**For a Provider that may be hidden by `<Activity>`, pass a factory or a ready instance — not a Promise.** Hiding, like unmounting, runs effect cleanup, and the two cannot be told apart during cleanup, so the Provider can only follow the ownership rule and destroy the database it holds (`destroy()` is terminal). On re-show, the factory is called again and builds a new database; a `Promise` cannot be re-evaluated and would only resolve to that already-destroyed instance again — the Provider will not hand it out, and instead makes `useRxDB()` throw a clear error (`useRxDBOptional()` is `undefined`). A factory must create a new database on every call; handing back an instance the Provider has already destroyed is treated as an error too. To share the same database, pass the instance directly.
