# UpdateHandler

Defined in: [packages/rxdb-adapter-http/src/http.interface.ts:192](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-http/src/http.interface.ts#L192)

Protocol mapping for `update`.

## Methods

### parse() \{#parse\}

```ts
parse(body, ctx): unknown;
```

Defined in: [packages/rxdb-adapter-http/src/http.interface.ts:195](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-http/src/http.interface.ts#L195)

Parses the full entity after the write; the receipt contract is the same as [CreateHandler.parse](CreateHandler.md#parse)

#### Parameters

| Parameter | Type                                |
| --------- | ----------------------------------- |
| `body`    | `unknown`                           |
| `ctx`     | [`UpdateContext`](UpdateContext.md) |

#### Returns

`unknown`

---

### request() \{#request\}

```ts
request(ctx): HttpRequestSpec;
```

Defined in: [packages/rxdb-adapter-http/src/http.interface.ts:193](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-http/src/http.interface.ts#L193)

#### Parameters

| Parameter | Type                                |
| --------- | ----------------------------------- |
| `ctx`     | [`UpdateContext`](UpdateContext.md) |

#### Returns

[`HttpRequestSpec`](HttpRequestSpec.md)
