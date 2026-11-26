# SidebarDrag

Defined in: [layout/sidebar-drag.ts:18](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/layout/sidebar-drag.ts#L18)

A single sidebar-width drag session.

## Remarks

While dragging, only the preview width is written to the CSS variable on the sidebar placeholder
element — preferences are not touched and subscribers are not notified,
so the shell and the page do not re-render as the pointer moves; on release, the value is
committed to preferences once (and flushed to disk only once, too).
The placeholder element also carries `data-resizing`, letting styles turn off the width
transition so the sidebar tracks the pointer instead of lagging behind the animation.

## Constructors

### Constructor

```ts
new SidebarDrag(
   preferences, 
   handle, 
   startX
): SidebarDrag;
```

Defined in: [layout/sidebar-drag.ts:38](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/layout/sidebar-drag.ts#L38)

Starts a drag; the width begins at the preference width at this moment.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `preferences` | [`PreferencesStore`](PreferencesStore.md) | The preferences store that receives the width on release. |
| `handle` | `Element` | The drag handle; must be rendered inside the sidebar placeholder element (`.admin-sidebar-slot`). |
| `startX` | `number` | The pointer's horizontal position at press. |

#### Returns

`SidebarDrag`

#### Throws

Throws when the handle is not inside the sidebar placeholder element.

## Accessors

### width \{#width\}

#### Get Signature

```ts
get width(): number;
```

Defined in: [layout/sidebar-drag.ts:27](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/layout/sidebar-drag.ts#L27)

The current width: the preview value while dragging, and the last value after it ends.

##### Returns

`number`

## Methods

### cancel() \{#cancel\}

```ts
cancel(): void;
```

Defined in: [layout/sidebar-drag.ts:71](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/layout/sidebar-drag.ts#L71)

Aborts: removes the preview, and preferences keep the pre-drag width. Repeat calls do nothing.

#### Returns

`void`

***

### end() \{#end\}

```ts
end(): void;
```

Defined in: [layout/sidebar-drag.ts:62](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/layout/sidebar-drag.ts#L62)

Releases: commits the preview width to preferences and removes the preview. Repeat calls do nothing.

#### Returns

`void`

***

### move() \{#move\}

```ts
move(clientX): number;
```

Defined in: [layout/sidebar-drag.ts:53](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/layout/sidebar-drag.ts#L53)

Pointer move: converts the delta into a width (clamped to [SIDEBAR\_WIDTH\_RANGE](../variables/SIDEBAR_WIDTH_RANGE.md)) and previews it.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `clientX` | `number` | The pointer's current horizontal position. |

#### Returns

`number`

The preview width (px); after the drag ends, returns the last width unchanged.
