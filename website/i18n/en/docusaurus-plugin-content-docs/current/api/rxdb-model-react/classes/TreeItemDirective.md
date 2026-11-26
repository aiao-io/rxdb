# TreeItemDirective

Defined in: [packages/rxdb-model-react/src/query-builder/tree-select/tree-select.tsx:52](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/query-builder/tree-select/tree-select.tsx#L52)

Tree node highlight directive (the React equivalent of the Angular side's `TreeItemDirective`).

## Remarks

The active state of React's tree select is managed by the component's internal index; this class preserves symmetry of the public API surface.
Use it when a custom theme needs to interact with tree nodes per the `Highlightable` contract.

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

Defined in: [packages/rxdb-model-react/src/query-builder/tree-select/tree-select.tsx:56](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/query-builder/tree-select/tree-select.tsx#L56)

Whether the current node is in the active (highlighted) state.

##### Returns

`boolean`

## Methods

### setActiveStyles() \{#setactivestyles\}

```ts
setActiveStyles(): void;
```

Defined in: [packages/rxdb-model-react/src/query-builder/tree-select/tree-select.tsx:61](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/query-builder/tree-select/tree-select.tsx#L61)

Sets the active styles (when keyboard navigation hits it).

#### Returns

`void`

---

### setInactiveStyles() \{#setinactivestyles\}

```ts
setInactiveStyles(): void;
```

Defined in: [packages/rxdb-model-react/src/query-builder/tree-select/tree-select.tsx:66](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/query-builder/tree-select/tree-select.tsx#L66)

Clears the active styles.

#### Returns

`void`
