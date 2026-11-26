# NamespacedState

Defined in: [rxdb-angular/src/use-state.ts:237](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-angular/src/use-state.ts#L237)

The state entry of a given `namespace + name`.

## Properties

### persistError \{#persisterror\}

```ts
readonly persistError: Signal<Error | undefined>;
```

Defined in: [rxdb-angular/src/use-state.ts:253](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-angular/src/use-state.ts#L253)

The most recent persistence failure; cleared automatically after a successful write to disk.

#### Remarks

Quota exceeded, circular references, BigInt, etc. all make the disk write fail while the signal value still updates — this field is the only way callers can tell that the data did not reach disk (RAN-010).

***

### signal \{#signal\}

```ts
readonly signal: <T>(initialValue, options?) => WritableSignal<T>;
```

Defined in: [rxdb-angular/src/use-state.ts:245](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-angular/src/use-state.ts#L245)

Obtains the signal for this key; always returns the same one for the same key.

#### Type Parameters

| Type Parameter |
| ------ |
| `T` |

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `initialValue` | `T` | Initial value on first registration; when a value already exists on disk, the on-disk value wins |
| `options?` | `CreateSignalOptions`&lt;`T`&gt; | Options passed to Angular `signal()`, effective only on first registration |

#### Returns

`WritableSignal`&lt;`T`&gt;

#### Throws

Thrown when the same key was previously registered with a different **value type** (RAN-010)
