# BASE_52_DIGITS

```ts
const BASE_52_DIGITS: string;
```

Defined in: [packages/utils/src/indexing/fractional-indexing.ts:35](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/indexing/fractional-indexing.ts#L35)

base-52 alphabet: A-Z + a-z

This is the default head alphabet when `digits` is omitted: the first half A-Z marks negative lengths and the second half a-z marks positive lengths, so default keys keep the classic `a0` / `Zz` shapes. When `digits` has an odd length (and so cannot carry an even-length head alphabet of its own), this constant must be passed explicitly.
