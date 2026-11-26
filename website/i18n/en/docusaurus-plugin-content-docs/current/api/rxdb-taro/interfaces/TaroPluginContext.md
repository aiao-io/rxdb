# TaroPluginContext

Defined in: [index.ts:45](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-taro/src/index.ts#L45)

**`Experimental`**

The Taro plugin context this plugin uses; structurally compatible with `@tarojs/service`'s `IPluginContext`.

## Properties

### paths \{#paths\}

```ts
readonly paths: object;
```

Defined in: [index.ts:47](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-taro/src/index.ts#L47)

**`Experimental`**

Project paths; `appPath` is the app root directory, from which the adapter is resolved.

#### appPath

```ts
readonly appPath: string;
```

## Methods

### modifyRunnerOpts() \{#modifyrunneropts\}

```ts
modifyRunnerOpts(hook): void;
```

Defined in: [index.ts:49](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-taro/src/index.ts#L49)

**`Experimental`**

Modifies the project configuration before the runner starts; Taro awaits it.

#### Parameters

| Parameter | Type               |
| --------- | ------------------ |
| `hook`    | (`args`) => `void` |

#### Returns

`void`
