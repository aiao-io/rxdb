# randomString()

```ts
function randomString(size?, alphabet?): string;
```

Defined in: [packages/utils/src/random/randomString.ts:27](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/random/randomString.ts#L27)

Generates an unbiased random string using Web Crypto and rejection sampling.

## Parameters

| Parameter | Type | Default value | Description |
| ------ | ------ | ------ | ------ |
| `size?` | `number` | `16` | Result length |
| `alphabet?` | `string` | `URL_ALL` | Optional character set |

## Returns

`string`

A random string
