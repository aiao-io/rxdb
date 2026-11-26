# EntityChangeOptions

Defined in: [rxdb-react/src/use-entity-change.ts:21](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-react/src/use-entity-change.ts#L21)

Time window configuration for [useEntityChange](../functions/useEntityChange.md).

## Remarks

Both fields are in **milliseconds**, defaulting to `0`; when both are set they apply **in series**, in the fixed order `debounceTime → auditTime`, not as either/or.

Only **positive finite values** take effect: `0` (the default), negative values, `NaN` and `Infinity` all mean the corresponding operator is not attached. When both windows are disabled, patches pass through synchronously and the component can re-render within the same update batch.

Changing a window value rebuilds the pipeline and re-subscribes.

## Properties

### auditTime? \{#audittime\}

```ts
auditTime?: number;
```

Defined in: [rxdb-react/src/use-entity-change.ts:25](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-react/src/use-entity-change.ts#L25)

Sampling window in milliseconds: only the last patch within the window is let through, providing a stable refresh throttle for continuous input.

***

### debounceTime? \{#debouncetime\}

```ts
debounceTime?: number;
```

Defined in: [rxdb-react/src/use-entity-change.ts:23](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-react/src/use-entity-change.ts#L23)

Debounce window in milliseconds: patches are let through only after input has been quiet for this long; no re-render during continuous input.
