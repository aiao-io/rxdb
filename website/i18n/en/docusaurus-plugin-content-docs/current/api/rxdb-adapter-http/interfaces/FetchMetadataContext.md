# FetchMetadataContext

Defined in: [packages/rxdb-adapter-http/src/http.interface.ts:59](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-http/src/http.interface.ts#L59)

Context for a single-page `fetchMetadata` request.

## Remarks

**This family of types carries no entity type parameter**; `where` / `data` are always on the `unknown` side. One adapter instance serves **all** entities on its remote slot, so a single type parameter could only be a union (where `RuleGroup<A | B>` would narrow fields to the intersection of the two — worse than nothing) or `unknown`; and core already passes `RuleGroup<unknown>`, so writing `RuleGroup<T>` could only hold via an unverified `as` cast — that's using types as comments. Integrators who need narrowing annotate the parameters in **their own** handler (method signatures are bivariant; `(ctx: FetchMetadataContext) => …` allows narrower parameters).

## Properties

### entityName \{#entityname\}

```ts
entityName: string;
```

Defined in: [packages/rxdb-adapter-http/src/http.interface.ts:60](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-http/src/http.interface.ts#L60)

***

### limit \{#limit\}

```ts
limit: number;
```

Defined in: [packages/rxdb-adapter-http/src/http.interface.ts:65](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-http/src/http.interface.ts#L65)

Comes from `pageSize`; the adapter guarantees a finite positive integer

***

### offset \{#offset\}

```ts
offset: number;
```

Defined in: [packages/rxdb-adapter-http/src/http.interface.ts:63](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-http/src/http.interface.ts#L63)

Starting offset of this page; can be ignored in token mode

***

### pageToken? \{#pagetoken\}

```ts
pageToken?: string;
```

Defined in: [packages/rxdb-adapter-http/src/http.interface.ts:75](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-http/src/http.interface.ts#L75)

The `nextPageToken` returned by the previous page; `undefined` on the first page.

#### Remarks

**Opaque**: the adapter only performs three judgments — equal / not equal / is it `undefined` — and never parses the internal structure. Deliberately not called `cursor` — core's `findByCursor` uses "cursor" for the keyset anchor made from an **entity instance**, a cursor that gets compiled into a `where` rule group inside the Repository and can be compared field by field, which the adapter never sees; this one can only be sent back to the remote as-is. The same name would make people think the latter can be taken apart too.

***

### where \{#where\}

```ts
where: RuleGroup<unknown>;
```

Defined in: [packages/rxdb-adapter-http/src/http.interface.ts:61](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-http/src/http.interface.ts#L61)
