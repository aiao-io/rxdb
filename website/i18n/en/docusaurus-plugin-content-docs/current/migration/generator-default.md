# Generator `default` semantics migration

`@aiao/rxdb-client-generator` changed how it serializes entity metadata: instead of a `JSON.stringify` / `JSON.parse` round trip before rendering, it now dispatches directly on the runtime type.

This is a **breaking change**. It fixes four silent defects at the cost that one class of declaration that used to "generate" now fails at generation time — and failing is exactly the point: the clients generated from those declarations were wrong to begin with.

## Behavior changes

| Declared `default`                                    | Before                                                               | After                                                     |
| ----------------------------------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------- |
| `7n` (bigint)                                         | Crashes with `TypeError: Do not know how to serialize a BigInt`      | Emits `7n`                                                |
| `new Uint8Array([1, 2])`                              | Collapses to `{ "0": 1, "1": 2 }`; the byte view is lost             | Emits `new Uint8Array([1, 2])`                            |
| `new Date('2024-01-02')`                              | Becomes an ISO string, indistinguishable from a handwritten string   | Emits `new Date("2024-01-02T00:00:00.000Z")`              |
| `'CURRENT_TIMESTAMP'`                                 | String                                                               | String (unchanged)                                        |
| Functions like `() => uuid()`                         | **The key is silently dropped**; the generated entity has no default | Fails at generation time with `unsupportedDefaultFactory` |
| `NaN` / `Infinity`                                    | Silently becomes `null`                                              | Fails at generation time with `unsupportedDefaultValue`   |
| Invalid `Date`, circular references, `Map`, and so on | Collapses to `{}` or a string                                        | Fails at generation time with `unsupportedDefaultValue`   |

`Uint8Array` only takes the bytes of the **current view**: `new Uint8Array([1,2,3,4,5]).subarray(1, 3)` generates `new Uint8Array([2, 3])`, excluding the rest of the underlying buffer.

Keys explicitly written as `default: undefined` are still treated as "no default value" and skipped — that semantic did not change.

## What to do about `unsupportedDefaultFactory`

The generator cannot see a function's closure or its import environment; any attempt to "restore the source" is a guess, so it does not try. Pick the equivalent for your scenario:

| Original                                                 | Migrate to                                                                                                                                                  |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Primary key `id: { default: () => uuid() }`              | Delete the declaration and extend `EntityBase` instead. The runtime base class provides the primary key default; it never went through the generator        |
| `createdAt` / `updatedAt` with `() => new Date()`        | Extend `EntityBase` as above; when the library side should generate it, write `default: 'CURRENT_TIMESTAMP'`                                                |
| Business date fields with `() => new Date()`             | `default: 'CURRENT_TIMESTAMP'`, evaluated by the adapter                                                                                                    |
| Business fields with per-call values like `() => uuid()` | Assign the value explicitly in the create API, or put it in the repository's create hook. "A new value on every call" is not expressible in static metadata |
| Closures that read external configuration                | Move to the create API. The closure environment is not available at generation time; any reconstruction is a guess                                          |

Entities that extend `EntityBase` are **unaffected**: serialization only walks the entity's own `properties` / `computedProperties` / `relations`, and the base class's three function defaults are not among them.

A `default` on a relation (1:1 and m:1) follows the same table; the field name in the error message is the relation name.

## How to read the error message

```text
unsupportedDefaultFactory: entity "Article" field "slug" (at metadata.properties[2].default) holds a function.
Replace it with a constant, 'CURRENT_TIMESTAMP', or assign the value when creating the record.
```

The entity name, field name, and key path are all in the message. The function body is **not** printed — a whole source fragment in an error message is useless and could leak business logic.

> Related: [Versioning and API stability](../versioning.md), [Client code generation](../client-generator.md)
