# isIgnorableDetachedVersionEventError()

```ts
function isIgnorableDetachedVersionEventError(error): boolean;
```

Defined in: [packages/rxdb-plugin-history/src/detached-event-error.ts:30](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-history/src/detached-event-error.ts#L30)

**`Internal`**

Decides whether an error of a detached event task is ignorable

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `error` | `unknown` | The error thrown by the task |

## Returns

`boolean`

Returns `true` when it is connection-teardown noise

## Remarks

Includes:
- errno 44 = ENODEV (Emscripten IDBFS connection closed)
- name === 'AbortError'
- adapter shutdown errors (a unified string-matching pattern)
