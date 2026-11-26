# TaroCompilerOptions

Defined in: [index.ts:21](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-taro/src/index.ts#L21)

**`Experimental`**

Taro's compiler configuration (object form).

## Indexable

```ts
[key: string]: unknown
```

**`Experimental`**

## Properties

### type \{#type\}

```ts
readonly type: string;
```

Defined in: [index.ts:24](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-taro/src/index.ts#L24)

**`Experimental`**

Compiler type; this plugin only accepts `'vite'`.

***

### vitePlugins? \{#viteplugins\}

```ts
readonly vitePlugins?: readonly unknown[];
```

Defined in: [index.ts:26](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-taro/src/index.ts#L26)

**`Experimental`**

Plugins appended for vite; Taro only accepts an array.
