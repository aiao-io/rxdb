# RxDBEntityChangeDirective

Defined in: [rxdb-angular/src/rxdb-change-detector.directive.ts:61](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-angular/src/rxdb-change-detector.directive.ts#L61)

RxDB entity change directive
If you use `changeDetection: ChangeDetectionStrategy.OnPush`, changes while typing do not trigger Angular's rendering mechanism; this directive provides real-time rendering

## Example

Use this directive when edits to an entity need live previews in multiple places

```html
<!-- Re-render immediately on every patch -->
<div [rxdbChangeDetector]="todo">{{ todo.title }}</div>

<!-- Re-render only after input has been quiet for 200ms -->
<div [debounceTime]="200" [rxdbChangeDetector]="todo">{{ todo.title }}</div>
```

## Remarks

`debounceTime` and `auditTime` are both in milliseconds, defaulting to `0`; when both are set they apply **in series**, in the order `debounceTime → auditTime` (RAN-015).

Only **positive finite values** are attached to the pipeline: `0` (the default), negative values, `NaN` and `Infinity` all count as disabling the corresponding operator. When both windows are disabled, patches pass through synchronously and the OnPush view can complete its `markForCheck` within the current change detection cycle (RAN-011).

## Constructors

### Constructor

```ts
new RxDBEntityChangeDirective(): RxDBEntityChangeDirective;
```

Defined in: [rxdb-angular/src/rxdb-change-detector.directive.ts:92](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-angular/src/rxdb-change-detector.directive.ts#L92)

#### Returns

`RxDBEntityChangeDirective`

## Properties

### auditTime \{#audittime\}

```ts
readonly auditTime: InputSignal<number>;
```

Defined in: [rxdb-angular/src/rxdb-change-detector.directive.ts:90](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-angular/src/rxdb-change-detector.directive.ts#L90)

Sampling window, in **milliseconds**. Default `0` means no sampling.

#### Remarks

Same semantics as RxJS `auditTime`: only the last value within the window is let through, providing a stable refresh throttle for continuous input. When set together with [debounceTime](#debouncetime), the two apply **in series**, with the pipeline order `debounceTime → auditTime`.

Only positive finite values take effect; `0`, negative values, `NaN` and `Infinity` mean the operator is not attached (RAN-011).

---

### debounceTime \{#debouncetime\}

```ts
readonly debounceTime: InputSignal<number>;
```

Defined in: [rxdb-angular/src/rxdb-change-detector.directive.ts:79](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-angular/src/rxdb-change-detector.directive.ts#L79)

Debounce window, in **milliseconds**. Default `0` means no debounce (every patch triggers one change detection synchronously).

#### Remarks

Same semantics as RxJS `debounceTime`: patches are let through only after input has been quiet for this long; no rendering during continuous input. When set together with [auditTime](#audittime), the two apply **in series** (debounce first, then audit), not as either/or.

Only positive finite values take effect; `0`, negative values, `NaN` and `Infinity` mean the operator is not attached (RAN-011).

---

### rxdbChangeDetector \{#rxdbchangedetector\}

```ts
readonly rxdbChangeDetector: InputSignal<any>;
```

Defined in: [rxdb-angular/src/rxdb-change-detector.directive.ts:68](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-angular/src/rxdb-change-detector.directive.ts#L68)

The entity instance to observe. No subscription is created while it is `undefined` (safe to bind entities that are not loaded yet).
