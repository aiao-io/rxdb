---
sidebar_label: 'RxDBSource⟨T⟩'
---

# RxDBSource`<T>`

```ts
type RxDBSource<T> = T | Promise<T> | (() => T | Promise<T>);
```

Defined in: [rxdb-vue/src/rxdb-vue.ts:19](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-vue/src/rxdb-vue.ts#L19)

Database forms accepted by `provideRxDB`: an instance, a Promise, or a factory returning either.

## Type Parameters

| Type Parameter                                                                   | Default type                         | Description   |
| -------------------------------------------------------------------------------- | ------------------------------------ | ------------- |
| <a id="type-parameter-t"></a> `T` _extends_ [`RxDB`](../../rxdb/classes/RxDB.md) | [`RxDB`](../../rxdb/classes/RxDB.md) | Database type |

## Remarks

The providers of the three framework packages (Angular / React / Vue) accept the **same** union type, with the same name — this is one of the landing points of the cross-framework symmetry rule: the same explanation of "how to hand the library to the framework" holds verbatim on all three sides, so users don't need to relearn it when switching frameworks.

Promises are allowed for scenarios like "candidates loaded via dynamic `import()`" (US-207 E11): the desktop branch must not be pulled into the web bundle by a static import, and `await import()` can only yield a Promise.

On top of this, the Vue side also accepts `Ref`; see [RxDBInput](RxDBInput.md).
