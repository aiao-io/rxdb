---
sidebar_label: 'DeepPartial⟨T⟩'
---

# DeepPartial`<T>`

```ts
type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends readonly unknown[] ? T[K]
  : T[K] extends object ? DeepPartial<T[K]>
  : T[K];
};
```

Defined in: [preferences/types.ts:224](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/preferences/types.ts#L224)

Deep partial type: array fields are replaced wholesale, object fields recurse.

## Type Parameters

| Type Parameter                    |
| --------------------------------- |
| <a id="type-parameter-t"></a> `T` |
