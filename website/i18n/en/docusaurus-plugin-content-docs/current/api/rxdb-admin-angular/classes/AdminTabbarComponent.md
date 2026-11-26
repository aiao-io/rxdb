# AdminTabbarComponent

Defined in: [rxdb-admin-angular/src/tabbar/tabbar.component.ts:28](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/tabbar/tabbar.component.ts#L28)

Tab bar: multiple tabs, pinning, drag / keyboard reordering, context menu, middle-click close, wheel horizontal scrolling. Not rendered when preferences disable it or there are no tabs yet.

## Constructors

### Constructor

```ts
new AdminTabbarComponent(): AdminTabbarComponent;
```

#### Returns

`AdminTabbarComponent`

## Properties

### anchor \{#anchor\}

```ts
protected readonly anchor: WritableSignal<TabMenuAnchor | null>;
```

Defined in: [rxdb-admin-angular/src/tabbar/tabbar.component.ts:53](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/tabbar/tabbar.component.ts#L53)

---

### dragKey \{#dragkey\}

```ts
protected readonly dragKey: WritableSignal<string | null>;
```

Defined in: [rxdb-admin-angular/src/tabbar/tabbar.component.ts:54](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/tabbar/tabbar.component.ts#L54)

---

### dropKey \{#dropkey\}

```ts
protected readonly dropKey: WritableSignal<string | null>;
```

Defined in: [rxdb-admin-angular/src/tabbar/tabbar.component.ts:55](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/tabbar/tabbar.component.ts#L55)

---

### History \{#history\}

```ts
protected readonly History: typeof LucideRotateCcwClock = LucideHistory;
```

Defined in: [rxdb-admin-angular/src/tabbar/tabbar.component.ts:56](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/tabbar/tabbar.component.ts#L56)

---

### icons \{#icons\}

```ts
protected readonly icons: Signal<Map<string, LucideIconInput | undefined>>;
```

Defined in: [rxdb-admin-angular/src/tabbar/tabbar.component.ts:50](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/tabbar/tabbar.component.ts#L50)

A tab's icon comes from the menu node matching its address.

---

### layout \{#layout\}

```ts
protected readonly layout: Signal<LayoutState>;
```

Defined in: [rxdb-admin-angular/src/tabbar/tabbar.component.ts:35](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/tabbar/tabbar.component.ts#L35)

---

### menu \{#menu\}

```ts
protected readonly menu: Signal<readonly MenuNode<LucideIconInput>[]>;
```

Defined in: [rxdb-admin-angular/src/tabbar/tabbar.component.ts:38](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/tabbar/tabbar.component.ts#L38)

---

### Pin \{#pin\}

```ts
protected readonly Pin: typeof LucidePin = LucidePin;
```

Defined in: [rxdb-admin-angular/src/tabbar/tabbar.component.ts:57](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/tabbar/tabbar.component.ts#L57)

---

### prefs \{#prefs\}

```ts
protected readonly prefs: Signal<AdminPreferences>;
```

Defined in: [rxdb-admin-angular/src/tabbar/tabbar.component.ts:36](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/tabbar/tabbar.component.ts#L36)

---

### t \{#t\}

```ts
protected readonly t: (key, params?) => string;
```

Defined in: [rxdb-admin-angular/src/tabbar/tabbar.component.ts:34](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/tabbar/tabbar.component.ts#L34)

Translates shell text.

#### Parameters

| Parameter | Type                                | Description     |
| --------- | ----------------------------------- | --------------- |
| `key`     | `string`                            | Text key.       |
| `params?` | `Record`&lt;`string`, `unknown`&gt; | ICU parameters. |

#### Returns

`string`

---

### tabbar \{#tabbar\}

```ts
protected readonly tabbar: Signal<{
  draggable: boolean;
  enable: boolean;
  maxCount: number;
  middleClickToClose: boolean;
  persist: TabbarPersist;
  showIcon: boolean;
  showMaximize: boolean;
  styleType: TabbarStyle;
  visitHistory: boolean;
  wheelable: boolean;
}>;
```

Defined in: [rxdb-admin-angular/src/tabbar/tabbar.component.ts:39](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/tabbar/tabbar.component.ts#L39)

---

### tabsState \{#tabsstate\}

```ts
protected readonly tabsState: Signal<TabsState>;
```

Defined in: [rxdb-admin-angular/src/tabbar/tabbar.component.ts:37](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/tabbar/tabbar.component.ts#L37)

---

### titled \{#titled\}

```ts
protected readonly titled: Signal<TabItem[]>;
```

Defined in: [rxdb-admin-angular/src/tabbar/tabbar.component.ts:42](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/tabbar/tabbar.component.ts#L42)

Tabs still open in the visit history, most recently visited first.

---

### visible \{#visible\}

```ts
protected readonly visible: Signal<boolean>;
```

Defined in: [rxdb-admin-angular/src/tabbar/tabbar.component.ts:40](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/tabbar/tabbar.component.ts#L40)

---

### X \{#x\}

```ts
protected readonly X: typeof LucideX = LucideX;
```

Defined in: [rxdb-admin-angular/src/tabbar/tabbar.component.ts:58](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/tabbar/tabbar.component.ts#L58)

## Methods

### activate() \{#activate\}

```ts
protected activate(event, key): void;
```

Defined in: [rxdb-admin-angular/src/tabbar/tabbar.component.ts:68](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/tabbar/tabbar.component.ts#L68)

#### Parameters

| Parameter | Type         |
| --------- | ------------ |
| `event`   | `MouseEvent` |
| `key`     | `string`     |

#### Returns

`void`

---

### close() \{#close\}

```ts
protected close(key): void;
```

Defined in: [rxdb-admin-angular/src/tabbar/tabbar.component.ts:64](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/tabbar/tabbar.component.ts#L64)

#### Parameters

| Parameter | Type     |
| --------- | -------- |
| `key`     | `string` |

#### Returns

`void`

---

### closeMenu() \{#closemenu\}

```ts
protected closeMenu(): void;
```

Defined in: [rxdb-admin-angular/src/tabbar/tabbar.component.ts:60](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/tabbar/tabbar.component.ts#L60)

#### Returns

`void`

---

### onAuxClick() \{#onauxclick\}

```ts
protected onAuxClick(
   event,
   key,
   pinned
): void;
```

Defined in: [rxdb-admin-angular/src/tabbar/tabbar.component.ts:93](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/tabbar/tabbar.component.ts#L93)

#### Parameters

| Parameter | Type         |
| --------- | ------------ |
| `event`   | `MouseEvent` |
| `key`     | `string`     |
| `pinned`  | `boolean`    |

#### Returns

`void`

---

### onContextMenu() \{#oncontextmenu\}

```ts
protected onContextMenu(event, key): void;
```

Defined in: [rxdb-admin-angular/src/tabbar/tabbar.component.ts:72](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/tabbar/tabbar.component.ts#L72)

#### Parameters

| Parameter | Type         |
| --------- | ------------ |
| `event`   | `MouseEvent` |
| `key`     | `string`     |

#### Returns

`void`

---

### onDragEnd() \{#ondragend\}

```ts
protected onDragEnd(): void;
```

Defined in: [rxdb-admin-angular/src/tabbar/tabbar.component.ts:120](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/tabbar/tabbar.component.ts#L120)

#### Returns

`void`

---

### onDragOver() \{#ondragover\}

```ts
protected onDragOver(event, key): void;
```

Defined in: [rxdb-admin-angular/src/tabbar/tabbar.component.ts:105](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/tabbar/tabbar.component.ts#L105)

#### Parameters

| Parameter | Type        |
| --------- | ----------- |
| `event`   | `DragEvent` |
| `key`     | `string`    |

#### Returns

`void`

---

### onDragStart() \{#ondragstart\}

```ts
protected onDragStart(event, key): void;
```

Defined in: [rxdb-admin-angular/src/tabbar/tabbar.component.ts:100](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/tabbar/tabbar.component.ts#L100)

#### Parameters

| Parameter | Type        |
| --------- | ----------- |
| `event`   | `DragEvent` |
| `key`     | `string`    |

#### Returns

`void`

---

### onDrop() \{#ondrop\}

```ts
protected onDrop(event, target): void;
```

Defined in: [rxdb-admin-angular/src/tabbar/tabbar.component.ts:111](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/tabbar/tabbar.component.ts#L111)

#### Parameters

| Parameter | Type        |
| --------- | ----------- |
| `event`   | `DragEvent` |
| `target`  | `string`    |

#### Returns

`void`

---

### onKeyDown() \{#onkeydown\}

```ts
protected onKeyDown(
   event,
   key,
   index
): void;
```

Defined in: [rxdb-admin-angular/src/tabbar/tabbar.component.ts:77](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/tabbar/tabbar.component.ts#L77)

#### Parameters

| Parameter | Type            |
| --------- | --------------- |
| `event`   | `KeyboardEvent` |
| `key`     | `string`        |
| `index`   | `number`        |

#### Returns

`void`

---

### onMouseDown() \{#onmousedown\}

```ts
protected onMouseDown(event): void;
```

Defined in: [rxdb-admin-angular/src/tabbar/tabbar.component.ts:89](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/tabbar/tabbar.component.ts#L89)

#### Parameters

| Parameter | Type         |
| --------- | ------------ |
| `event`   | `MouseEvent` |

#### Returns

`void`

---

### onWheel() \{#onwheel\}

```ts
protected onWheel(event): void;
```

Defined in: [rxdb-admin-angular/src/tabbar/tabbar.component.ts:125](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/tabbar/tabbar.component.ts#L125)

#### Parameters

| Parameter | Type         |
| --------- | ------------ |
| `event`   | `WheelEvent` |

#### Returns

`void`
