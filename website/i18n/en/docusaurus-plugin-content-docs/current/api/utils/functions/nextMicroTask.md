# nextMicroTask()

```ts
function nextMicroTask<T, R>(fn?): Promise<void | R>;
```

Defined in: [packages/utils/src/async/nextMicroTask.ts:11](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/async/nextMicroTask.ts#L11)

Defers a function to the next microtask queue

## Type Parameters

| Type Parameter | Default type | Description |
| ------ | ------ | ------ |
| <a id="type-parameter-t"></a> `T` | `void` | The type of `this` in the callback |
| <a id="type-parameter-r"></a> `R` | `void` | The callback's return type |

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `fn?` | (`this`) => `R` | The function to defer; optional |

## Returns

`Promise`&lt;`void` \| `R`&gt;

A Promise that resolves with the callback's result; when no callback is given, resolves in the next microtask
