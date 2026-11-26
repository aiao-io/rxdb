# CryptoEnvelope

Defined in: [packages/rxdb-adapter-encrypted/src/envelope.ts:24](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-encrypted/src/envelope.ts#L24)

Decoded AES-GCM envelope fields. All binary fields are standalone `Uint8Array`s.

## Properties

### alg \{#alg\}

```ts
alg: "AGCM256";
```

Defined in: [packages/rxdb-adapter-encrypted/src/envelope.ts:26](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-encrypted/src/envelope.ts#L26)

***

### ct \{#ct\}

```ts
ct: Uint8Array;
```

Defined in: [packages/rxdb-adapter-encrypted/src/envelope.ts:29](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-encrypted/src/envelope.ts#L29)

***

### iv \{#iv\}

```ts
iv: Uint8Array;
```

Defined in: [packages/rxdb-adapter-encrypted/src/envelope.ts:28](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-encrypted/src/envelope.ts#L28)

***

### kid \{#kid\}

```ts
kid: string;
```

Defined in: [packages/rxdb-adapter-encrypted/src/envelope.ts:27](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-encrypted/src/envelope.ts#L27)

***

### tag \{#tag\}

```ts
tag: Uint8Array;
```

Defined in: [packages/rxdb-adapter-encrypted/src/envelope.ts:30](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-encrypted/src/envelope.ts#L30)

***

### v \{#v\}

```ts
v: EnvelopeVersion;
```

Defined in: [packages/rxdb-adapter-encrypted/src/envelope.ts:25](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-encrypted/src/envelope.ts#L25)
