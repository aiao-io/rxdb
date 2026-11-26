# emptyFunction()

```ts
function emptyFunction(): void;
```

Defined in: [packages/utils/src/function/emptyFunction.ts:20](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/function/emptyFunction.ts#L20)

An empty function that does nothing
Commonly used as a default callback or placeholder

## Returns

`void`

## Examples

```ts
// as a default callback
function processData(data, callback = emptyFunction) {
  // process the data...
  callback();
}
```

```ts
// as a placeholder
const config = {
  onSuccess: emptyFunction,
  onError: emptyFunction
};
```
