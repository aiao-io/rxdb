# __decorateClass()

## Call Signature

```ts
function __decorateClass<TTarget>(decorators, target, key?, kind?): TTarget;
```

Defined in: [packages/rxdb/src/rxdb-utils.ts:157](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-utils.ts#L157)

Applies decorators in order (from last to first) per decorator semantics, returning the final result.

### Type Parameters

| Type Parameter                                                   |
| ---------------------------------------------------------------- |
| <a id="type-parameter-ttarget"></a> `TTarget` _extends_ `object` |

### Parameters

| Parameter    | Type                           | Description                                                                                                 |
| ------------ | ------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `decorators` | readonly `DecoratorFunction`[] | The decorator list; when a decorator returns a falsy value, the result of the previous step is carried over |
| `target`     | `TTarget`                      | The class being decorated (class decorator) or the object holding the member                                |
| `key?`       | `PropertyKey`                  | The member name; unused in the class decorator branch                                                       |
| `kind?`      | `0`                            | Omitted or 0: class decorator, returns the decorated class                                                  |

### Returns

`TTarget`

The decorated class

### Remarks

The return type branches on `kind`, consistent with the runtime; entity code produced by client generators only uses the class decorator branch.

### Example

```typescript
let Todo = class extends EntityBase {};
Todo = __decorateClass([Entity({ name: 'Todo', properties: [] })], Todo);
```

## Call Signature

```ts
function __decorateClass(decorators, target, key, kind): PropertyDescriptor | undefined;
```

Defined in: [packages/rxdb/src/rxdb-utils.ts:172](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-utils.ts#L172)

The member decorator branch: the initial value is the own property descriptor of `key` on `target`.

### Parameters

| Parameter    | Type                           | Description                   |
| ------------ | ------------------------------ | ----------------------------- |
| `decorators` | readonly `DecoratorFunction`[] | The decorator list            |
| `target`     | `object`                       | The object holding the member |
| `key`        | `PropertyKey`                  | The member name               |
| `kind`       | `1`                            | 1                             |

### Returns

`PropertyDescriptor` \| `undefined`

The decorated property descriptor; `undefined` when `target` has no such member and no decorator gave a new value

## Call Signature

```ts
function __decorateClass(decorators, target, key, kind): unknown;
```

Defined in: [packages/rxdb/src/rxdb-utils.ts:187](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-utils.ts#L187)

The field decorator branch (`kind` greater than 1): there is no initial value.

### Parameters

| Parameter    | Type                           | Description                     |
| ------------ | ------------------------------ | ------------------------------- |
| `decorators` | readonly `DecoratorFunction`[] | The decorator list              |
| `target`     | `object`                       | The object holding the field    |
| `key`        | `PropertyKey`                  | The field name                  |
| `kind`       | `number`                       | A decorator kind greater than 1 |

### Returns

`unknown`

The return value of the last decorator that gave a value; `undefined` when no decorator gave one
