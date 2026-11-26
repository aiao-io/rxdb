# parseEntityRecordValues()

```ts
function parseEntityRecordValues(metadata, raw): Record<string, unknown>;
```

Defined in: [packages/rxdb/src/entity/entity-value.utils.ts:186](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-value.utils.ts#L186)

Decodes a whole raw record into runtime values on the entity side, according to the entity metadata.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `metadata` | [`EntityMetadata`](../type-aliases/EntityMetadata.md) | Entity metadata; determines which type each key is decoded as |
| `raw` | `Readonly`&lt;`Record`&lt;`string`, `unknown`&gt;&gt; | The raw record, typically JSON such as a remote REST response |

## Returns

`Record`&lt;`string`, `unknown`&gt;

A new object; **contains only keys present in `raw`**

## Throws

Thrown by [parseEntityFieldValue](parseEntityFieldValue.md) when the type of a declared property is not a member of [EntityFieldTypeName](../type-aliases/EntityFieldTypeName.md)

## Remarks

Serves boundaries of the kind "remote JSON is applied directly onto entity instances". JSON has no `Date` — dates on the wire are ISO strings; a plain `Object.assign` turns `entity.updatedAt` from `Date` into `string`, while the runtime contract of `PropertyType.date` is `Date` (see the date branch of [parseEntityFieldValue](parseEntityFieldValue.md)). Downstream code calling `.toISOString()` per contract throws on the spot — inside template rendering that throw commits the bindings before it and skips the ones after, leaving a half-updated row of DOM.

Three deliberate boundaries:

- **No key synthesis**. Only the enumerable own keys of `raw` are mapped; absent fields are never added. `parseEntityFieldValue` normalizes `undefined` into `null`, so synthesizing keys would mean overwriting perfectly good values on the entity with `null`.
- **Keys outside the metadata pass through unchanged**. Things carried along with the response, such as `__etag`, belong to no declared property; this function cannot interpret them, and guessing a type on the caller's behalf is worse than leaving them alone.
- **`__proto__` alone is not passed through**. In JSON it is a legal own key, but the result is meant to be `Object.assign`ed onto an entity instance: the assignment form would hit the prototype setter and replace the result object's prototype with the remote-provided object (remote data impersonating fields through inheritance); handed out as an own key, `Object.assign` would again go through [[Set]] and swap the instance's prototype, wiping out all instance methods. It cannot be a declared property (rejected by the `reservedName` rule at registration), and dropping it loses no entity data. The result is built with `Object.fromEntries()`, so all remaining keys (including `constructor` / `toString`) are own data keys.
