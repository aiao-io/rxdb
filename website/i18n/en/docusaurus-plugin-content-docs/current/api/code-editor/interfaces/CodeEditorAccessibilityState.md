# CodeEditorAccessibilityState

Defined in: [accessibility.ts:25](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/code-editor/src/accessibility.ts#L25)

Input for computing the accessibility attributes of the inner textbox.

The fields are deliberately all optional: the three frameworks' input / prop defaults differ (Angular's `input<string>('')`, `undefined` in React / Vue), so here they are uniformly treated as "empty means unset".

## Properties

### describedBy? \{#describedby\}

```ts
readonly describedBy?: string;
```

Defined in: [accessibility.ts:27](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/code-editor/src/accessibility.ts#L27)

Id of the descriptive text element, mapped to `aria-describedby`.

---

### disabled? \{#disabled\}

```ts
readonly disabled?: boolean;
```

Defined in: [accessibility.ts:29](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/code-editor/src/accessibility.ts#L29)

Whether the editor is currently in an **effective disabled** state (the merged result of `disabled` and form disabling).

---

### label? \{#label\}

```ts
readonly label?: string;
```

Defined in: [accessibility.ts:31](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/code-editor/src/accessibility.ts#L31)

Accessible name, mapped to `aria-label`.

---

### labelledBy? \{#labelledby\}

```ts
readonly labelledBy?: string;
```

Defined in: [accessibility.ts:33](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/code-editor/src/accessibility.ts#L33)

Id of the element acting as the label, mapped to `aria-labelledby`.
