---
sidebar_label: 'RxDBSource⟨T⟩'
---

# RxDBSource`<T>`

```ts
type RxDBSource<T> = T | Promise<T> | (() => T | Promise<T>);
```

Defined in: [rxdb-angular/src/rxdb.provider.ts:24](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-angular/src/rxdb.provider.ts#L24)

The database form accepted by `provideRxDB`: an instance, a Promise, or a factory returning either.

## Type Parameters

| Type Parameter                                                                   | Default type                         | Description                                                     |
| -------------------------------------------------------------------------------- | ------------------------------------ | --------------------------------------------------------------- |
| <a id="type-parameter-t"></a> `T` _extends_ [`RxDB`](../../rxdb/classes/RxDB.md) | [`RxDB`](../../rxdb/classes/RxDB.md) | Database type, defaulting to [RxDB](../../rxdb/classes/RxDB.md) |

## Remarks

The providers of all three framework packages (Angular / React / Vue) accept the **same** union type, with the same name — one of the landing points of the cross-framework symmetry rule: the same "how to hand the library to the framework" explanation holds word for word on all three sides, and users do not need to relearn it when switching frameworks.

Promises are allowed for scenarios like "candidates go through dynamic `import()`" (US-207 E11): the desktop branch must not be pulled into the web bundle by a static import, and `await import()` can only yield a Promise.
