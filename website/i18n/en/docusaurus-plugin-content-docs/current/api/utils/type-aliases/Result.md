---
sidebar_label: "Result⟨T, ErrorDataType⟩"
---

# Result`<T, ErrorDataType>`

```ts
type Result<T, ErrorDataType> = XOR<SuccessResult<T>, ErrorResult<ErrorDataType>>;
```

Defined in: [packages/utils/src/type-definition/result-types.ts:14](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/type-definition/result-types.ts#L14)

A result type where success data and error data are mutually exclusive.

## Type Parameters

| Type Parameter | Default type |
| ------ | ------ |
| <a id="type-parameter-t"></a> `T` | `unknown` |
| <a id="type-parameter-errordatatype"></a> `ErrorDataType` | `unknown` |
