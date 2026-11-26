# TreeItemDirective

Defined in: [packages/rxdb-model-vue/src/query-builder/tree-select/tree-item-directive.ts:9](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-vue/src/query-builder/tree-select/tree-item-directive.ts#L9)

Tree node highlight directive (the Vue equivalent of the Angular-side CDK `TreeItemDirective` / the same-named React class).

## Remarks

The active state of Vue tree selection is managed by the component's internal indexing (TreeKeyManager replaces
`ActiveDescendantKeyManager`); this class keeps the public API surface symmetric;
use it when a custom theme needs to interact with tree nodes per the `Highlightable` contract.

## Constructors

### Constructor

```ts
new TreeItemDirective(): TreeItemDirective;
```

#### Returns

`TreeItemDirective`

## Accessors

### isActive \{#isactive\}

#### Get Signature

```ts
get isActive(): boolean;
```

Defined in: [packages/rxdb-model-vue/src/query-builder/tree-select/tree-item-directive.ts:13](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-vue/src/query-builder/tree-select/tree-item-directive.ts#L13)

Whether the current node is in the active (highlighted) state.

##### Returns

`boolean`

## Methods

### setActiveStyles() \{#setactivestyles\}

```ts
setActiveStyles(): void;
```

Defined in: [packages/rxdb-model-vue/src/query-builder/tree-select/tree-item-directive.ts:18](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-vue/src/query-builder/tree-select/tree-item-directive.ts#L18)

Sets the active styles (when hit by keyboard navigation).

#### Returns

`void`

---

### setInactiveStyles() \{#setinactivestyles\}

```ts
setInactiveStyles(): void;
```

Defined in: [packages/rxdb-model-vue/src/query-builder/tree-select/tree-item-directive.ts:23](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-vue/src/query-builder/tree-select/tree-item-directive.ts#L23)

Clears the active styles.

#### Returns

`void`
