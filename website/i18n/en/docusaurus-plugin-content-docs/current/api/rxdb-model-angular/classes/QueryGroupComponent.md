# QueryGroupComponent

Defined in: [packages/rxdb-model-angular/src/query-builder/query-group/query-group.component.ts:310](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/query-group/query-group.component.ts#L310)

Query rule group component (recursive)

## Description

Displays a group of query rules, supporting:

- AND/OR toggle (Teable style: inline conjunction prefix)
- Add rule/subgroup
- Delete group
- Recursive nested display

## Constructors

### Constructor

```ts
new QueryGroupComponent(): QueryGroupComponent;
```

#### Returns

`QueryGroupComponent`

## Properties

### addGroup \{#addgroup\}

```ts
readonly addGroup: OutputEmitterRef<string>;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/query-group/query-group.component.ts:323](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/query-group/query-group.component.ts#L323)

---

### addRule \{#addrule\}

```ts
readonly addRule: OutputEmitterRef<{
  parentId: string;
  rule: Omit<UIRule, "id">;
}>;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/query-group/query-group.component.ts:322](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/query-group/query-group.component.ts#L322)

---

### allowCollapse \{#allowcollapse\}

```ts
readonly allowCollapse: InputSignal<boolean>;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/query-group/query-group.component.ts:320](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/query-group/query-group.component.ts#L320)

Whether expanding/collapsing the group is allowed (enabled by default)

---

### canAddGroup \{#canaddgroup\}

```ts
readonly canAddGroup: Signal<boolean>;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/query-group/query-group.component.ts:332](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/query-group/query-group.component.ts#L332)

Whether a subgroup can be added (the maximum depth has not been reached)

---

### collapsed \{#collapsed\}

```ts
readonly collapsed: WritableSignal<boolean>;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/query-group/query-group.component.ts:329](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/query-group/query-group.component.ts#L329)

Whether the current group is collapsed

---

### depth \{#depth\}

```ts
readonly depth: InputSignal<number>;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/query-group/query-group.component.ts:316](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/query-group/query-group.component.ts#L316)

---

### dragDropHandler \{#dragdrophandler\}

```ts
readonly dragDropHandler: InputSignal<QueryDragDropHandler | undefined>;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/query-group/query-group.component.ts:318](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/query-group/query-group.component.ts#L318)

---

### errors \{#errors\}

```ts
readonly errors: InputSignal<ValidationError[]>;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/query-group/query-group.component.ts:315](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/query-group/query-group.component.ts#L315)

---

### fields \{#fields\}

```ts
readonly fields: InputSignal<FieldMetadata[]>;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/query-group/query-group.component.ts:314](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/query-group/query-group.component.ts#L314)

---

### group \{#group\}

```ts
readonly group: InputSignal<UIRuleGroup>;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/query-group/query-group.component.ts:313](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/query-group/query-group.component.ts#L313)

---

### maxDepth \{#maxdepth\}

```ts
readonly maxDepth: InputSignal<number>;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/query-group/query-group.component.ts:317](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/query-group/query-group.component.ts#L317)

---

### nestingLimitHint \{#nestinglimithint\}

```ts
readonly nestingLimitHint: Signal<string>;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/query-group/query-group.component.ts:335](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/query-group/query-group.component.ts#L335)

Reason shown to the user when the nesting limit is reached (the AC requires a "limit exceeded" hint; it must not be silent)

---

### removeItem \{#removeitem\}

```ts
readonly removeItem: OutputEmitterRef<string>;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/query-group/query-group.component.ts:324](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/query-group/query-group.component.ts#L324)

---

### updateCombinator \{#updatecombinator\}

```ts
readonly updateCombinator: OutputEmitterRef<{
  combinator: "and" | "or";
  id: string;
}>;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/query-group/query-group.component.ts:326](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/query-group/query-group.component.ts#L326)

---

### updateRule \{#updaterule\}

```ts
readonly updateRule: OutputEmitterRef<{
  id: string;
  updates: Partial<UIRule>;
}>;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/query-group/query-group.component.ts:325](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/query-group/query-group.component.ts#L325)

## Accessors

### modelI18n \{#modeli18n\}

#### Get Signature

```ts
get modelI18n(): ModelI18n;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/query-group/query-group.component.ts:341](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/query-group/query-group.component.ts#L341)

##### Returns

[`ModelI18n`](../interfaces/ModelI18n.md)

---

### t \{#t\}

#### Get Signature

```ts
get t(): (key, params?) => string;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/query-group/query-group.component.ts:338](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/query-group/query-group.component.ts#L338)

Toggles the collapsed state

##### Returns

(`key`, `params?`) => `string`

## Methods

### asRule() \{#asrule\}

```ts
asRule(item): UIRule;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/query-group/query-group.component.ts:407](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/query-group/query-group.component.ts#L407)

Type conversion: casts to a rule

#### Parameters

| Parameter | Type                                                                                    |
| --------- | --------------------------------------------------------------------------------------- |
| `item`    | \| [`UIRule`](../interfaces/UIRule.md) \| [`UIRuleGroup`](../interfaces/UIRuleGroup.md) |

#### Returns

[`UIRule`](../interfaces/UIRule.md)

---

### asRuleGroup() \{#asrulegroup\}

```ts
asRuleGroup(item): UIRuleGroup;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/query-group/query-group.component.ts:402](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/query-group/query-group.component.ts#L402)

Type conversion: casts to a rule group

#### Parameters

| Parameter | Type                                                                                    |
| --------- | --------------------------------------------------------------------------------------- |
| `item`    | \| [`UIRule`](../interfaces/UIRule.md) \| [`UIRuleGroup`](../interfaces/UIRuleGroup.md) |

#### Returns

[`UIRuleGroup`](../interfaces/UIRuleGroup.md)

---

### isDragging() \{#isdragging\}

```ts
isDragging(itemId): boolean;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/query-group/query-group.component.ts:416](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/query-group/query-group.component.ts#L416)

#### Parameters

| Parameter | Type     |
| --------- | -------- |
| `itemId`  | `string` |

#### Returns

`boolean`

---

### isDropInvalid() \{#isdropinvalid\}

```ts
isDropInvalid(itemId): boolean;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/query-group/query-group.component.ts:425](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/query-group/query-group.component.ts#L425)

#### Parameters

| Parameter | Type     |
| --------- | -------- |
| `itemId`  | `string` |

#### Returns

`boolean`

---

### isDropTarget() \{#isdroptarget\}

```ts
isDropTarget(itemId, mode): boolean;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/query-group/query-group.component.ts:420](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/query-group/query-group.component.ts#L420)

#### Parameters

| Parameter | Type                                                |
| --------- | --------------------------------------------------- |
| `itemId`  | `string`                                            |
| `mode`    | [`QueryDropMode`](../type-aliases/QueryDropMode.md) |

#### Returns

`boolean`

---

### isRuleGroup() \{#isrulegroup\}

```ts
isRuleGroup(item): item is UIRuleGroup;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/query-group/query-group.component.ts:397](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/query-group/query-group.component.ts#L397)

Type guard: whether it is a rule group

#### Parameters

| Parameter | Type                                                                                    |
| --------- | --------------------------------------------------------------------------------------- |
| `item`    | \| [`UIRule`](../interfaces/UIRule.md) \| [`UIRuleGroup`](../interfaces/UIRuleGroup.md) |

#### Returns

`item is UIRuleGroup`

---

### onAddGroup() \{#onaddgroup\}

```ts
onAddGroup(): void;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/query-group/query-group.component.ts:375](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/query-group/query-group.component.ts#L375)

Adds a subgroup

#### Returns

`void`

---

### onAddRule() \{#onaddrule\}

```ts
onAddRule(): void;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/query-group/query-group.component.ts:357](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/query-group/query-group.component.ts#L357)

Adds a rule

#### Returns

`void`

---

### onItemDragEnd() \{#onitemdragend\}

```ts
onItemDragEnd(): void;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/query-group/query-group.component.ts:496](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/query-group/query-group.component.ts#L496)

#### Returns

`void`

---

### onItemDragLeave() \{#onitemdragleave\}

```ts
onItemDragLeave(event): void;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/query-group/query-group.component.ts:457](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/query-group/query-group.component.ts#L457)

#### Parameters

| Parameter | Type        |
| --------- | ----------- |
| `event`   | `DragEvent` |

#### Returns

`void`

---

### onItemDragOver() \{#onitemdragover\}

```ts
onItemDragOver(
   event,
   item,
   index,
   isGroup
): void;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/query-group/query-group.component.ts:444](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/query-group/query-group.component.ts#L444)

#### Parameters

| Parameter | Type                                                                                    |
| --------- | --------------------------------------------------------------------------------------- |
| `event`   | `DragEvent`                                                                             |
| `item`    | \| [`UIRule`](../interfaces/UIRule.md) \| [`UIRuleGroup`](../interfaces/UIRuleGroup.md) |
| `index`   | `number`                                                                                |
| `isGroup` | `boolean`                                                                               |

#### Returns

`void`

---

### onItemDragStart() \{#onitemdragstart\}

```ts
onItemDragStart(event, item): void;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/query-group/query-group.component.ts:430](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/query-group/query-group.component.ts#L430)

#### Parameters

| Parameter | Type                                                                                    |
| --------- | --------------------------------------------------------------------------------------- |
| `event`   | `DragEvent`                                                                             |
| `item`    | \| [`UIRule`](../interfaces/UIRule.md) \| [`UIRuleGroup`](../interfaces/UIRuleGroup.md) |

#### Returns

`void`

---

### onItemDrop() \{#onitemdrop\}

```ts
onItemDrop(
   event,
   targetItem,
   targetIndex,
   isGroup
): void;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/query-group/query-group.component.ts:465](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/query-group/query-group.component.ts#L465)

#### Parameters

| Parameter     | Type                                                                                    |
| ------------- | --------------------------------------------------------------------------------------- |
| `event`       | `DragEvent`                                                                             |
| `targetItem`  | \| [`UIRule`](../interfaces/UIRule.md) \| [`UIRuleGroup`](../interfaces/UIRuleGroup.md) |
| `targetIndex` | `number`                                                                                |
| `isGroup`     | `boolean`                                                                               |

#### Returns

`void`

---

### onRemove() \{#onremove\}

```ts
onRemove(): void;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/query-group/query-group.component.ts:382](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/query-group/query-group.component.ts#L382)

Deletes this group

#### Returns

`void`

---

### onRuleRemove() \{#onruleremove\}

```ts
onRuleRemove(id): void;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/query-group/query-group.component.ts:392](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/query-group/query-group.component.ts#L392)

Deletes a rule

#### Parameters

| Parameter | Type     |
| --------- | -------- |
| `id`      | `string` |

#### Returns

`void`

---

### onRuleUpdate() \{#onruleupdate\}

```ts
onRuleUpdate(event): void;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/query-group/query-group.component.ts:387](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/query-group/query-group.component.ts#L387)

Rule update

#### Parameters

| Parameter       | Type                                                                                   |
| --------------- | -------------------------------------------------------------------------------------- |
| `event`         | \{ `id`: `string`; `updates`: `Partial`&lt;[`UIRule`](../interfaces/UIRule.md)&gt;; \} |
| `event.id`      | `string`                                                                               |
| `event.updates` | `Partial`&lt;[`UIRule`](../interfaces/UIRule.md)&gt;                                   |

#### Returns

`void`

---

### toggleCollapse() \{#togglecollapse\}

```ts
toggleCollapse(): void;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/query-group/query-group.component.ts:345](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/query-group/query-group.component.ts#L345)

#### Returns

`void`

---

### toggleCombinator() \{#togglecombinator\}

```ts
toggleCombinator(combinator): void;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/query-group/query-group.component.ts:350](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/query-group/query-group.component.ts#L350)

Toggles the combinator

#### Parameters

| Parameter    | Type              |
| ------------ | ----------------- |
| `combinator` | `"and"` \| `"or"` |

#### Returns

`void`

---

### trackByItem() \{#trackbyitem\}

```ts
trackByItem(item): string;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/query-group/query-group.component.ts:412](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/query-group/query-group.component.ts#L412)

Tracking function

#### Parameters

| Parameter | Type                                                                                    |
| --------- | --------------------------------------------------------------------------------------- |
| `item`    | \| [`UIRule`](../interfaces/UIRule.md) \| [`UIRuleGroup`](../interfaces/UIRuleGroup.md) |

#### Returns

`string`
