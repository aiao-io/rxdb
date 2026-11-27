# TaroRunnerOptions

Defined in: [index.ts:34](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-taro/src/index.ts#L34)

**`Experimental`**

The whole project configuration received by `modifyRunnerOpts`; this plugin only reads/writes `compiler`.

## Indexable

```ts
[key: string]: unknown
```

**`Experimental`**

## Properties

### compiler? \{#compiler\}

```ts
compiler?: string | TaroCompilerOptions;
```

Defined in: [index.ts:37](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-taro/src/index.ts#L37)

**`Experimental`**

The compiler: string, object form, or default (Taro treats it as webpack5).
