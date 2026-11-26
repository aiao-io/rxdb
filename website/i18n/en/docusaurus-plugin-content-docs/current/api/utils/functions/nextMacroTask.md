# nextMacroTask()

```ts
function nextMacroTask(fn): Timeout;
```

Defined in: [packages/utils/src/async/nextMacroTask.ts:17](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/async/nextMacroTask.ts#L17)

Executes a function in the next macro task
Uses setTimeout(fn, 0) to defer the function until the current execution stack is empty

## Parameters

| Parameter | Type            | Description           |
| --------- | --------------- | --------------------- |
| `fn`      | () => `unknown` | The function to defer |

## Returns

`Timeout`

## Example

```ts
console.log('1');
nextMacroTask(() => console.log('3'));
console.log('2');
// output order: 1, 2, 3
**Note:** macro tasks include setTimeout, setInterval, I/O operations, etc.
**Note:** commonly used to avoid blocking the current execution stack, or to ensure code runs after DOM updates
**Note:** difference from nextMicroTask: macro tasks run after micro tasks

The return type is written explicitly as `ReturnType<typeof setTimeout>`: inference would write `NodeJS.Timeout` into the published
`.d.ts`, and consumers without `@types/node` would get TS2503 (RV-078); the explicit form lets each consumer's environment resolve it.
```
