---
sidebar_label: 'FixedRowDrag⟨Id⟩'
---

# FixedRowDrag`<Id>`

Defined in: [packages/utils/src/@browser/fixed-row-drag.ts:73](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/@browser/fixed-row-drag.ts#L73)

Pointer drag kernel for virtual lists with fixed-height rows.

Under virtual scrolling, rows outside the viewport are not in the DOM, so the drop position cannot rely on "which element is under the pointer"; instead the index is computed as `floor((clientY - list top edge) / rowHeight)`. When the pointer stays within one row height of the scroll container's top or bottom edge, it scrolls frame by frame and recomputes the drop position as it scrolls — no need to release and re-scroll to reach a position outside the viewport.

An index points at the same row only while the list is unchanged: the session binds to the id sequence at drag start, and if the list changes mid-drag the drag is cancelled rather than applying a stale index to the new list (which would move a different row or go out of bounds).

Listeners are attached to `window` (pointermove / pointerup / pointercancel / Escape) and exist only during a drag; call [FixedRowDrag.dispose](#dispose) when done. Requires `window` and `requestAnimationFrame` — browser only.

## Example

```ts
const drag = new FixedRowDrag({
  rowHeight: 48,
  scrollElement: () => main,
  listElement: () => list,
  ids: () => rows.map(row => row.id),
  onChange: state => (dragState = state),
  onDrop: ({ id, ids, fromIndex, toIndex }) => save(id, reorderTargetForMove(ids, fromIndex, toIndex))
});
handle.addEventListener('pointerdown', event => drag.start(event, index));
```

## Type Parameters

| Type Parameter                      | Default type |
| ----------------------------------- | ------------ |
| <a id="type-parameter-id"></a> `Id` | `unknown`    |

## Constructors

### Constructor

```ts
new FixedRowDrag<Id>(options): FixedRowDrag<Id>;
```

Defined in: [packages/utils/src/@browser/fixed-row-drag.ts:85](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/@browser/fixed-row-drag.ts#L85)

#### Parameters

| Parameter | Type                                                                      |
| --------- | ------------------------------------------------------------------------- |
| `options` | [`FixedRowDragOptions`](../interfaces/FixedRowDragOptions.md)&lt;`Id`&gt; |

#### Returns

`FixedRowDrag`&lt;`Id`&gt;

## Accessors

### dragging \{#dragging\}

#### Get Signature

```ts
get dragging(): boolean;
```

Defined in: [packages/utils/src/@browser/fixed-row-drag.ts:81](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/@browser/fixed-row-drag.ts#L81)

Whether a drag is in progress

##### Returns

`boolean`

## Methods

### cancel() \{#cancel\}

```ts
cancel(): void;
```

Defined in: [packages/utils/src/@browser/fixed-row-drag.ts:115](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/@browser/fixed-row-drag.ts#L115)

Cancels the current drag without calling `onDrop`

#### Returns

`void`

---

### dispose() \{#dispose\}

```ts
dispose(): void;
```

Defined in: [packages/utils/src/@browser/fixed-row-drag.ts:121](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/@browser/fixed-row-drag.ts#L121)

Releases the listeners; equivalent to [FixedRowDrag.cancel](#cancel), for use when the component is destroyed

#### Returns

`void`

---

### start() \{#start\}

```ts
start(event, fromIndex): void;
```

Defined in: [packages/utils/src/@browser/fixed-row-drag.ts:97](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/@browser/fixed-row-drag.ts#L97)

Starts a drag from the row at `fromIndex` and snapshots the current id sequence.

Ignored on non-primary-button press or when a drag is already in progress; throws `RangeError` when `fromIndex` is outside the index range of the current id sequence.

#### Parameters

| Parameter   | Type           |
| ----------- | -------------- |
| `event`     | `PointerEvent` |
| `fromIndex` | `number`       |

#### Returns

`void`
