# RawWriteGate()

Defined in: [packages/rxdb/src/capture/raw-write-gate.ts:26](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/capture/raw-write-gate.ts#L26)

The judgment entry point for a single raw write; provided by the capture runtime

## Remarks

Declared as an interface with a generic call signature rather than a `type Gate = <T>(…) => …` alias: the two are equivalent, but with the interface form, errors on the implementation side point at the specific member instead of the whole function type.

```ts
RawWriteGate<T>(sql, execute): Promise<T>;
```

Defined in: [packages/rxdb/src/capture/raw-write-gate.ts:34](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/capture/raw-write-gate.ts#L34)

## Type Parameters

| Type Parameter                    | Description                                                                  |
| --------------------------------- | ---------------------------------------------------------------------------- |
| <a id="type-parameter-t"></a> `T` | Return type of the statement executor; passed through unchanged when allowed |

## Parameters

| Parameter | Type                              | Description                            |
| --------- | --------------------------------- | -------------------------------------- |
| `sql`     | `string`                          | The raw statement text to be judged    |
| `execute` | () => `T` \| `Promise`&lt;`T`&gt; | The executor body, **not yet invoked** |

## Returns

`Promise`&lt;`T`&gt;

The return value of `execute()` itself

## Throws

Thrown when the judgment falls on rejection; in that case `execute` is never called
