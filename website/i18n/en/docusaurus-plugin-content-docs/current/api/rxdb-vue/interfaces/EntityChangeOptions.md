# EntityChangeOptions

Defined in: [rxdb-vue/src/use-entity-change.ts:30](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-vue/src/use-entity-change.ts#L30)

Time-window configuration of [useEntityChange](../functions/useEntityChange.md).

## Remarks

Both fields are in **milliseconds**, default `0`; when both are set they take effect **in series**, with the order fixed at `debounceTime → auditTime` — not an either/or.

Only **positive finite values** take effect: `0` (the default), negative values, `NaN`, and `Infinity` all mean not wiring in the corresponding operator. When both windows are disabled, patches pass through synchronously and the component can finish re-rendering within the current tick.

Both fields accept reactive inputs: changing a window rebuilds the pipeline and re-subscribes.

## Properties

### auditTime? \{#audittime\}

```ts
auditTime?: MaybeRefOrGetter<number>;
```

Defined in: [rxdb-vue/src/use-entity-change.ts:34](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-vue/src/use-entity-change.ts#L34)

Sampling window in milliseconds: only the last patch within the window is let through, providing a steady refresh throttle for continuous input.

***

### debounceTime? \{#debouncetime\}

```ts
debounceTime?: MaybeRefOrGetter<number>;
```

Defined in: [rxdb-vue/src/use-entity-change.ts:32](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-vue/src/use-entity-change.ts#L32)

Debounce window in milliseconds: nothing is let through until it stays quiet for this duration; no re-render during continuous input.
