# CodeEditorProps

Defined in: [packages/code-editor-react/src/CodeEditor.tsx:55](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/code-editor-react/src/CodeEditor.tsx#L55)

Props of `CodeEditor`. Unlisted props pass through to the host `div` (`className` / `style` /
`data-*` / DOM events, etc.), except `children` / `dangerouslySetInnerHTML` / `onChange`.

## Extends

- `CodeEditorHostProps`

## Properties

### about? \{#about\}

```ts
about?: string;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2914

#### Inherited from

`CodeEditorHostProps.about`

---

### accessKey? \{#accesskey\}

```ts
accessKey?: string;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2887

#### Inherited from

`CodeEditorHostProps.accessKey`

---

### aria-activedescendant? \{#aria-activedescendant\}

```ts
"aria-activedescendant"?: string;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2585

Identifies the currently active element when DOM focus is on a composite widget, textbox, group, or application.

#### Inherited from

`CodeEditorHostProps.aria-activedescendant`

---

### aria-atomic? \{#aria-atomic\}

```ts
"aria-atomic"?: Booleanish;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2587

Indicates whether assistive technologies will present all, or only parts of, the changed region based on the change notifications defined by the aria-relevant attribute.

#### Inherited from

`CodeEditorHostProps.aria-atomic`

---

### aria-autocomplete? \{#aria-autocomplete\}

```ts
"aria-autocomplete"?: "none" | "both" | "inline" | "list";
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2592

Indicates whether inputting text could trigger display of one or more predictions of the user's intended value for an input and specifies how predictions would be
presented if they are made.

#### Inherited from

`CodeEditorHostProps.aria-autocomplete`

---

### aria-braillelabel? \{#aria-braillelabel\}

```ts
"aria-braillelabel"?: string;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2598

Defines a string value that labels the current element, which is intended to be converted into Braille.

#### See

aria-label.

#### Inherited from

`CodeEditorHostProps.aria-braillelabel`

---

### aria-brailleroledescription? \{#aria-brailleroledescription\}

```ts
"aria-brailleroledescription"?: string;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2603

Defines a human-readable, author-localized abbreviated description for the role of an element, which is intended to be converted into Braille.

#### See

aria-roledescription.

#### Inherited from

`CodeEditorHostProps.aria-brailleroledescription`

---

### aria-busy? \{#aria-busy\}

```ts
"aria-busy"?: Booleanish;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2604

#### Inherited from

`CodeEditorHostProps.aria-busy`

---

### aria-checked? \{#aria-checked\}

```ts
"aria-checked"?: boolean | "true" | "false" | "mixed";
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2609

Indicates the current "checked" state of checkboxes, radio buttons, and other widgets.

#### See

- aria-pressed
- aria-selected.

#### Inherited from

`CodeEditorHostProps.aria-checked`

---

### aria-colcount? \{#aria-colcount\}

```ts
"aria-colcount"?: number;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2614

Defines the total number of columns in a table, grid, or treegrid.

#### See

aria-colindex.

#### Inherited from

`CodeEditorHostProps.aria-colcount`

---

### aria-colindex? \{#aria-colindex\}

```ts
"aria-colindex"?: number;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2619

Defines an element's column index or position with respect to the total number of columns within a table, grid, or treegrid.

#### See

- aria-colcount
- aria-colspan.

#### Inherited from

`CodeEditorHostProps.aria-colindex`

---

### aria-colindextext? \{#aria-colindextext\}

```ts
"aria-colindextext"?: string;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2624

Defines a human readable text alternative of aria-colindex.

#### See

aria-rowindextext.

#### Inherited from

`CodeEditorHostProps.aria-colindextext`

---

### aria-colspan? \{#aria-colspan\}

```ts
"aria-colspan"?: number;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2629

Defines the number of columns spanned by a cell or gridcell within a table, grid, or treegrid.

#### See

- aria-colindex
- aria-rowspan.

#### Inherited from

`CodeEditorHostProps.aria-colspan`

---

### aria-controls? \{#aria-controls\}

```ts
"aria-controls"?: string;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2634

Identifies the element (or elements) whose contents or presence are controlled by the current element.

#### See

aria-owns.

#### Inherited from

`CodeEditorHostProps.aria-controls`

---

### aria-current? \{#aria-current\}

```ts
"aria-current"?: boolean | "true" | "false" | "page" | "step" | "location" | "date" | "time";
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2636

Indicates the element that represents the current item within a container or set of related elements.

#### Inherited from

`CodeEditorHostProps.aria-current`

---

### aria-describedby? \{#aria-describedby\}

```ts
"aria-describedby"?: string;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2641

Identifies the element (or elements) that describes the object.

#### See

aria-labelledby

#### Inherited from

`CodeEditorHostProps.aria-describedby`

---

### aria-description? \{#aria-description\}

```ts
"aria-description"?: string;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2646

Defines a string value that describes or annotates the current element.

#### See

related aria-describedby.

#### Inherited from

`CodeEditorHostProps.aria-description`

---

### aria-details? \{#aria-details\}

```ts
"aria-details"?: string;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2651

Identifies the element that provides a detailed, extended description for the object.

#### See

aria-describedby.

#### Inherited from

`CodeEditorHostProps.aria-details`

---

### aria-disabled? \{#aria-disabled\}

```ts
"aria-disabled"?: Booleanish;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2656

Indicates that the element is perceivable but disabled, so it is not editable or otherwise operable.

#### See

- aria-hidden
- aria-readonly.

#### Inherited from

`CodeEditorHostProps.aria-disabled`

---

### ~~aria-dropeffect?~~ \{#aria-dropeffect\}

```ts
"aria-dropeffect"?: "none" | "link" | "copy" | "move" | "execute" | "popup";
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2661

Indicates what functions can be performed when a dragged object is released on the drop target.

#### Deprecated

in ARIA 1.1

#### Inherited from

`CodeEditorHostProps.aria-dropeffect`

---

### aria-errormessage? \{#aria-errormessage\}

```ts
"aria-errormessage"?: string;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2666

Identifies the element that provides an error message for the object.

#### See

- aria-invalid
- aria-describedby.

#### Inherited from

`CodeEditorHostProps.aria-errormessage`

---

### aria-expanded? \{#aria-expanded\}

```ts
"aria-expanded"?: Booleanish;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2668

Indicates whether the element, or another grouping element it controls, is currently expanded or collapsed.

#### Inherited from

`CodeEditorHostProps.aria-expanded`

---

### aria-flowto? \{#aria-flowto\}

```ts
"aria-flowto"?: string;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2673

Identifies the next element (or elements) in an alternate reading order of content which, at the user's discretion,
allows assistive technology to override the general default of reading in document source order.

#### Inherited from

`CodeEditorHostProps.aria-flowto`

---

### ~~aria-grabbed?~~ \{#aria-grabbed\}

```ts
"aria-grabbed"?: Booleanish;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2678

Indicates an element's "grabbed" state in a drag-and-drop operation.

#### Deprecated

in ARIA 1.1

#### Inherited from

`CodeEditorHostProps.aria-grabbed`

---

### aria-haspopup? \{#aria-haspopup\}

```ts
"aria-haspopup"?:
  | boolean
  | "true"
  | "false"
  | "listbox"
  | "grid"
  | "menu"
  | "dialog"
  | "tree";
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2680

Indicates the availability and type of interactive popup element, such as menu or dialog, that can be triggered by an element.

#### Inherited from

`CodeEditorHostProps.aria-haspopup`

---

### aria-hidden? \{#aria-hidden\}

```ts
"aria-hidden"?: Booleanish;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2685

Indicates whether the element is exposed to an accessibility API.

#### See

aria-disabled.

#### Inherited from

`CodeEditorHostProps.aria-hidden`

---

### aria-invalid? \{#aria-invalid\}

```ts
"aria-invalid"?: boolean | "true" | "false" | "grammar" | "spelling";
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2690

Indicates the entered value does not conform to the format expected by the application.

#### See

aria-errormessage.

#### Inherited from

`CodeEditorHostProps.aria-invalid`

---

### aria-keyshortcuts? \{#aria-keyshortcuts\}

```ts
"aria-keyshortcuts"?: string;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2692

Indicates keyboard shortcuts that an author has implemented to activate or give focus to an element.

#### Inherited from

`CodeEditorHostProps.aria-keyshortcuts`

---

### aria-label? \{#aria-label\}

```ts
"aria-label"?: string;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2697

Defines a string value that labels the current element.

#### See

aria-labelledby.

#### Inherited from

`CodeEditorHostProps.aria-label`

---

### aria-labelledby? \{#aria-labelledby\}

```ts
"aria-labelledby"?: string;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2702

Identifies the element (or elements) that labels the current element.

#### See

aria-describedby.

#### Inherited from

`CodeEditorHostProps.aria-labelledby`

---

### aria-level? \{#aria-level\}

```ts
"aria-level"?: number;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2704

Defines the hierarchical level of an element within a structure.

#### Inherited from

`CodeEditorHostProps.aria-level`

---

### aria-live? \{#aria-live\}

```ts
"aria-live"?: "off" | "assertive" | "polite";
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2706

Indicates that an element will be updated, and describes the types of updates the user agents, assistive technologies, and user can expect from the live region.

#### Inherited from

`CodeEditorHostProps.aria-live`

---

### aria-modal? \{#aria-modal\}

```ts
"aria-modal"?: Booleanish;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2708

Indicates whether an element is modal when displayed.

#### Inherited from

`CodeEditorHostProps.aria-modal`

---

### aria-multiline? \{#aria-multiline\}

```ts
"aria-multiline"?: Booleanish;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2710

Indicates whether a text box accepts multiple lines of input or only a single line.

#### Inherited from

`CodeEditorHostProps.aria-multiline`

---

### aria-multiselectable? \{#aria-multiselectable\}

```ts
"aria-multiselectable"?: Booleanish;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2712

Indicates that the user may select more than one item from the current selectable descendants.

#### Inherited from

`CodeEditorHostProps.aria-multiselectable`

---

### aria-orientation? \{#aria-orientation\}

```ts
"aria-orientation"?: "horizontal" | "vertical";
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2714

Indicates whether the element's orientation is horizontal, vertical, or unknown/ambiguous.

#### Inherited from

`CodeEditorHostProps.aria-orientation`

---

### aria-owns? \{#aria-owns\}

```ts
"aria-owns"?: string;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2720

Identifies an element (or elements) in order to define a visual, functional, or contextual parent/child relationship
between DOM elements where the DOM hierarchy cannot be used to represent the relationship.

#### See

aria-controls.

#### Inherited from

`CodeEditorHostProps.aria-owns`

---

### aria-placeholder? \{#aria-placeholder\}

```ts
"aria-placeholder"?: string;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2725

Defines a short hint (a word or short phrase) intended to aid the user with data entry when the control has no value.
A hint could be a sample value or a brief description of the expected format.

#### Inherited from

`CodeEditorHostProps.aria-placeholder`

---

### aria-posinset? \{#aria-posinset\}

```ts
"aria-posinset"?: number;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2730

Defines an element's number or position in the current set of listitems or treeitems. Not required if all elements in the set are present in the DOM.

#### See

aria-setsize.

#### Inherited from

`CodeEditorHostProps.aria-posinset`

---

### aria-pressed? \{#aria-pressed\}

```ts
"aria-pressed"?: boolean | "true" | "false" | "mixed";
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2735

Indicates the current "pressed" state of toggle buttons.

#### See

- aria-checked
- aria-selected.

#### Inherited from

`CodeEditorHostProps.aria-pressed`

---

### aria-readonly? \{#aria-readonly\}

```ts
"aria-readonly"?: Booleanish;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2740

Indicates that the element is not editable, but is otherwise operable.

#### See

aria-disabled.

#### Inherited from

`CodeEditorHostProps.aria-readonly`

---

### aria-relevant? \{#aria-relevant\}

```ts
"aria-relevant"?:
  | "all"
  | "text"
  | "additions"
  | "additions removals"
  | "additions text"
  | "removals"
  | "removals additions"
  | "removals text"
  | "text additions"
  | "text removals";
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2745

Indicates what notifications the user agent will trigger when the accessibility tree within a live region is modified.

#### See

aria-atomic.

#### Inherited from

`CodeEditorHostProps.aria-relevant`

---

### aria-required? \{#aria-required\}

```ts
"aria-required"?: Booleanish;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2758

Indicates that user input is required on the element before a form may be submitted.

#### Inherited from

`CodeEditorHostProps.aria-required`

---

### aria-roledescription? \{#aria-roledescription\}

```ts
"aria-roledescription"?: string;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2760

Defines a human-readable, author-localized description for the role of an element.

#### Inherited from

`CodeEditorHostProps.aria-roledescription`

---

### aria-rowcount? \{#aria-rowcount\}

```ts
"aria-rowcount"?: number;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2765

Defines the total number of rows in a table, grid, or treegrid.

#### See

aria-rowindex.

#### Inherited from

`CodeEditorHostProps.aria-rowcount`

---

### aria-rowindex? \{#aria-rowindex\}

```ts
"aria-rowindex"?: number;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2770

Defines an element's row index or position with respect to the total number of rows within a table, grid, or treegrid.

#### See

- aria-rowcount
- aria-rowspan.

#### Inherited from

`CodeEditorHostProps.aria-rowindex`

---

### aria-rowindextext? \{#aria-rowindextext\}

```ts
"aria-rowindextext"?: string;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2775

Defines a human readable text alternative of aria-rowindex.

#### See

aria-colindextext.

#### Inherited from

`CodeEditorHostProps.aria-rowindextext`

---

### aria-rowspan? \{#aria-rowspan\}

```ts
"aria-rowspan"?: number;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2780

Defines the number of rows spanned by a cell or gridcell within a table, grid, or treegrid.

#### See

- aria-rowindex
- aria-colspan.

#### Inherited from

`CodeEditorHostProps.aria-rowspan`

---

### aria-selected? \{#aria-selected\}

```ts
"aria-selected"?: Booleanish;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2785

Indicates the current "selected" state of various widgets.

#### See

- aria-checked
- aria-pressed.

#### Inherited from

`CodeEditorHostProps.aria-selected`

---

### aria-setsize? \{#aria-setsize\}

```ts
"aria-setsize"?: number;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2790

Defines the number of items in the current set of listitems or treeitems. Not required if all elements in the set are present in the DOM.

#### See

aria-posinset.

#### Inherited from

`CodeEditorHostProps.aria-setsize`

---

### aria-sort? \{#aria-sort\}

```ts
"aria-sort"?: "none" | "ascending" | "descending" | "other";
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2792

Indicates if items in a table or grid are sorted in ascending or descending order.

#### Inherited from

`CodeEditorHostProps.aria-sort`

---

### aria-valuemax? \{#aria-valuemax\}

```ts
"aria-valuemax"?: number;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2794

Defines the maximum allowed value for a range widget.

#### Inherited from

`CodeEditorHostProps.aria-valuemax`

---

### aria-valuemin? \{#aria-valuemin\}

```ts
"aria-valuemin"?: number;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2796

Defines the minimum allowed value for a range widget.

#### Inherited from

`CodeEditorHostProps.aria-valuemin`

---

### aria-valuenow? \{#aria-valuenow\}

```ts
"aria-valuenow"?: number;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2801

Defines the current value for a range widget.

#### See

aria-valuetext.

#### Inherited from

`CodeEditorHostProps.aria-valuenow`

---

### aria-valuetext? \{#aria-valuetext\}

```ts
"aria-valuetext"?: string;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2803

Defines the human readable text alternative of aria-valuenow for a range widget.

#### Inherited from

`CodeEditorHostProps.aria-valuetext`

---

### autoCapitalize? \{#autocapitalize\}

```ts
autoCapitalize?:
  | string & object
  | "none"
  | "off"
  | "on"
  | "sentences"
  | "words"
  | "characters";
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2888

#### Inherited from

`CodeEditorHostProps.autoCapitalize`

---

### autoCorrect? \{#autocorrect\}

```ts
autoCorrect?: string;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2927

#### Inherited from

`CodeEditorHostProps.autoCorrect`

---

### autoFocus? \{#autofocus\}

```ts
autoFocus?: boolean;
```

Defined in: [packages/code-editor-react/src/CodeEditor.tsx:177](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/code-editor-react/src/CodeEditor.tsx#L177)

Focuses the editor immediately after mount.

#### Default Value

```ts
false;
```

#### Remarks

**Read on first mount only**; later changes are ignored. Does not grab focus when `disabled` or `readonly` is true, judged with the values at mount time.

#### Overrides

`CodeEditorHostProps.autoFocus`

---

### autoSave? \{#autosave\}

```ts
autoSave?: string;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2928

#### Inherited from

`CodeEditorHostProps.autoSave`

---

### className? \{#classname\}

```ts
className?: string;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2890

#### Inherited from

`CodeEditorHostProps.className`

---

### color? \{#color\}

```ts
color?: string;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2929

#### Inherited from

`CodeEditorHostProps.color`

---

### content? \{#content\}

```ts
content?: string;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2915

#### Inherited from

`CodeEditorHostProps.content`

---

### contentEditable? \{#contenteditable\}

```ts
contentEditable?: "inherit" | Booleanish | "plaintext-only";
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2891

#### Inherited from

`CodeEditorHostProps.contentEditable`

---

### contextMenu? \{#contextmenu\}

```ts
contextMenu?: string;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2892

#### Inherited from

`CodeEditorHostProps.contextMenu`

---

### datatype? \{#datatype\}

```ts
datatype?: string;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2916

#### Inherited from

`CodeEditorHostProps.datatype`

---

### defaultChecked? \{#defaultchecked\}

```ts
defaultChecked?: boolean;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2881

#### Inherited from

`CodeEditorHostProps.defaultChecked`

---

### defaultValue? \{#defaultvalue\}

```ts
defaultValue?: string | number | readonly string[];
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2882

#### Inherited from

`CodeEditorHostProps.defaultValue`

---

### describedBy? \{#describedby\}

```ts
describedBy?: string;
```

Defined in: [packages/code-editor-react/src/CodeEditor.tsx:137](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/code-editor-react/src/CodeEditor.tsx#L137)

Id of the supplementary description element, written as the inner textbox's `aria-describedby`.

#### Remarks

Lands in the same place as [CodeEditorProps.label](#label).

---

### dir? \{#dir\}

```ts
dir?: string;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2893

#### Inherited from

`CodeEditorHostProps.dir`

---

### disabled? \{#disabled\}

```ts
disabled?: boolean;
```

Defined in: [packages/code-editor-react/src/CodeEditor.tsx:116](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/code-editor-react/src/CodeEditor.tsx#L116)

Disabled: read-only and non-editable, and reports `aria-disabled` to assistive technology.

#### Default Value

```ts
false;
```

#### Remarks

Independent from `readonly`; either being true makes the editor non-editable;
the difference is that disabled also writes `aria-disabled` and suppresses `autoFocus`.

---

### draggable? \{#draggable\}

```ts
draggable?: Booleanish;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2894

#### Inherited from

`CodeEditorHostProps.draggable`

---

### enterKeyHint? \{#enterkeyhint\}

```ts
enterKeyHint?: "search" | "next" | "enter" | "done" | "go" | "previous" | "send";
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2895

#### Inherited from

`CodeEditorHostProps.enterKeyHint`

---

### exportparts? \{#exportparts\}

```ts
exportparts?: string;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2962

#### See

[https://developer.mozilla.org/en-US/docs/Web/HTML/Global\_attributes/exportparts](https://developer.mozilla.org/en-US/docs/Web/HTML/Global_attributes/exportparts)

#### Inherited from

`CodeEditorHostProps.exportparts`

---

### hidden? \{#hidden\}

```ts
hidden?: boolean;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2896

#### Inherited from

`CodeEditorHostProps.hidden`

---

### highlightWhitespace? \{#highlightwhitespace\}

```ts
highlightWhitespace?: boolean;
```

Defined in: [packages/code-editor-react/src/CodeEditor.tsx:169](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/code-editor-react/src/CodeEditor.tsx#L169)

Shows whitespace characters.

#### Default Value

```ts
false;
```

---

### id? \{#id\}

```ts
id?: string;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2897

#### Inherited from

`CodeEditorHostProps.id`

---

### indentUnit? \{#indentunit\}

```ts
indentUnit?: string;
```

Defined in: [packages/code-editor-react/src/CodeEditor.tsx:157](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/code-editor-react/src/CodeEditor.tsx#L157)

The string used for one level of indentation.

#### Default Value

```ts
'  ' (two spaces, consistent across all three frameworks)
```

---

### indentWithTab? \{#indentwithtab\}

```ts
indentWithTab?: boolean;
```

Defined in: [packages/code-editor-react/src/CodeEditor.tsx:151](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/code-editor-react/src/CodeEditor.tsx#L151)

Allows Tab-key indentation.

#### Default Value

```ts
false;
```

#### Remarks

When enabled, Tab no longer moves focus and keyboard users get stuck in the editor — an accessibility trade-off,
turned off consistently by default across all three frameworks.

---

### inert? \{#inert\}

```ts
inert?: boolean;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2948

#### See

[https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement/inert](https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement/inert)

#### Inherited from

`CodeEditorHostProps.inert`

---

### inlist? \{#inlist\}

```ts
inlist?: any;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2917

#### Inherited from

`CodeEditorHostProps.inlist`

---

### inputMode? \{#inputmode\}

```ts
inputMode?:
  | "none"
  | "search"
  | "text"
  | "tel"
  | "url"
  | "email"
  | "numeric"
  | "decimal";
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2953

Hints at the type of data that might be entered by the user while editing the element or its contents

#### See

[https://html.spec.whatwg.org/multipage/interaction.html#input-modalities:-the-inputmode-attribute](https://html.spec.whatwg.org/multipage/interaction.html#input-modalities:-the-inputmode-attribute)

#### Inherited from

`CodeEditorHostProps.inputMode`

---

### is? \{#is\}

```ts
is?: string;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2958

Specify that a standard HTML element should behave like a defined custom built-in element

#### See

[https://html.spec.whatwg.org/multipage/custom-elements.html#attr-is](https://html.spec.whatwg.org/multipage/custom-elements.html#attr-is)

#### Inherited from

`CodeEditorHostProps.is`

---

### itemID? \{#itemid\}

```ts
itemID?: string;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2933

#### Inherited from

`CodeEditorHostProps.itemID`

---

### itemProp? \{#itemprop\}

```ts
itemProp?: string;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2930

#### Inherited from

`CodeEditorHostProps.itemProp`

---

### itemRef? \{#itemref\}

```ts
itemRef?: string;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2934

#### Inherited from

`CodeEditorHostProps.itemRef`

---

### itemScope? \{#itemscope\}

```ts
itemScope?: boolean;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2931

#### Inherited from

`CodeEditorHostProps.itemScope`

---

### itemType? \{#itemtype\}

```ts
itemType?: string;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2932

#### Inherited from

`CodeEditorHostProps.itemType`

---

### label? \{#label\}

```ts
label?: string;
```

Defined in: [packages/code-editor-react/src/CodeEditor.tsx:125](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/code-editor-react/src/CodeEditor.tsx#L125)

Accessible name, written as the inner textbox's `aria-label`.

#### Remarks

The attribute lands on CodeMirror's `.cm-content` — that's the element carrying `role="textbox"`,
not the host `div`. Empty strings are treated as "unset". Same name and semantics across all three frameworks.

It does not conflict with an `aria-label` passed straight through to the host: that one stays on the host element untouched.

---

### labelledBy? \{#labelledby\}

```ts
labelledBy?: string;
```

Defined in: [packages/code-editor-react/src/CodeEditor.tsx:131](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/code-editor-react/src/CodeEditor.tsx#L131)

Id of the element acting as the label, written as the inner textbox's `aria-labelledby`.

#### Remarks

Lands in the same place as [CodeEditorProps.label](#label).

---

### lang? \{#lang\}

```ts
lang?: string;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2898

#### Inherited from

`CodeEditorHostProps.lang`

---

### language? \{#language\}

```ts
language?: string;
```

Defined in: [packages/code-editor-react/src/CodeEditor.tsx:90](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/code-editor-react/src/CodeEditor.tsx#L90)

Language name or alias for syntax highlighting; `''` and `'plaintext'` mean no highlighting.

#### Default Value

```ts
'sql';
```

---

### languages? \{#languages\}

```ts
languages?: readonly CodeEditorLanguageDescription[];
```

Defined in: [packages/code-editor-react/src/CodeEditor.tsx:100](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/code-editor-react/src/CodeEditor.tsx#L100)

Candidate language list; an empty list means no highlighting.

#### Default Value

```ts
SUPPORT_LANGUAGES;
```

#### Remarks

Passing an inline literal (`languages={[myLang]}`) has a cost: every render is a new array.
The component compares item by item by identity, then uses [isSameResolvedLanguage](../../code-editor/functions/isSameResolvedLanguage.md) to check whether the
description resolved for the current language really changed — it only re-runs `load()` when it did. But both checks still run;
a stable reference (a module-level constant or `useMemo`) is cheaper.

---

### lineWrapping? \{#linewrapping\}

```ts
lineWrapping?: boolean;
```

Defined in: [packages/code-editor-react/src/CodeEditor.tsx:163](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/code-editor-react/src/CodeEditor.tsx#L163)

Line wrapping.

#### Default Value

```ts
false;
```

---

### nonce? \{#nonce\}

```ts
nonce?: string;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2899

#### Inherited from

`CodeEditorHostProps.nonce`

---

### onAbort? \{#onabort\}

```ts
onAbort?: ReactEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2421

#### Inherited from

`CodeEditorHostProps.onAbort`

---

### onAbortCapture? \{#onabortcapture\}

```ts
onAbortCapture?: ReactEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2422

#### Inherited from

`CodeEditorHostProps.onAbortCapture`

---

### onAnimationEnd? \{#onanimationend\}

```ts
onAnimationEnd?: AnimationEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2551

#### Inherited from

`CodeEditorHostProps.onAnimationEnd`

---

### onAnimationEndCapture? \{#onanimationendcapture\}

```ts
onAnimationEndCapture?: AnimationEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2552

#### Inherited from

`CodeEditorHostProps.onAnimationEndCapture`

---

### onAnimationIteration? \{#onanimationiteration\}

```ts
onAnimationIteration?: AnimationEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2553

#### Inherited from

`CodeEditorHostProps.onAnimationIteration`

---

### onAnimationIterationCapture? \{#onanimationiterationcapture\}

```ts
onAnimationIterationCapture?: AnimationEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2554

#### Inherited from

`CodeEditorHostProps.onAnimationIterationCapture`

---

### onAnimationStart? \{#onanimationstart\}

```ts
onAnimationStart?: AnimationEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2549

#### Inherited from

`CodeEditorHostProps.onAnimationStart`

---

### onAnimationStartCapture? \{#onanimationstartcapture\}

```ts
onAnimationStartCapture?: AnimationEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2550

#### Inherited from

`CodeEditorHostProps.onAnimationStartCapture`

---

### onAuxClick? \{#onauxclick\}

```ts
onAuxClick?: MouseEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2467

#### Inherited from

`CodeEditorHostProps.onAuxClick`

---

### onAuxClickCapture? \{#onauxclickcapture\}

```ts
onAuxClickCapture?: MouseEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2468

#### Inherited from

`CodeEditorHostProps.onAuxClickCapture`

---

### onBeforeInput? \{#onbeforeinput\}

```ts
onBeforeInput?: InputEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2393

#### Inherited from

`CodeEditorHostProps.onBeforeInput`

---

### onBeforeInputCapture? \{#onbeforeinputcapture\}

```ts
onBeforeInputCapture?: InputEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2394

#### Inherited from

`CodeEditorHostProps.onBeforeInputCapture`

---

### onBeforeToggle? \{#onbeforetoggle\}

```ts
onBeforeToggle?: ToggleEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2558

#### Inherited from

`CodeEditorHostProps.onBeforeToggle`

---

### onBlur? \{#onblur\}

```ts
onBlur?: FocusEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2387

#### Inherited from

`CodeEditorHostProps.onBlur`

---

### onBlurCapture? \{#onblurcapture\}

```ts
onBlurCapture?: FocusEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2388

#### Inherited from

`CodeEditorHostProps.onBlurCapture`

---

### onCanPlay? \{#oncanplay\}

```ts
onCanPlay?: ReactEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2423

#### Inherited from

`CodeEditorHostProps.onCanPlay`

---

### onCanPlayCapture? \{#oncanplaycapture\}

```ts
onCanPlayCapture?: ReactEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2424

#### Inherited from

`CodeEditorHostProps.onCanPlayCapture`

---

### onCanPlayThrough? \{#oncanplaythrough\}

```ts
onCanPlayThrough?: ReactEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2425

#### Inherited from

`CodeEditorHostProps.onCanPlayThrough`

---

### onCanPlayThroughCapture? \{#oncanplaythroughcapture\}

```ts
onCanPlayThroughCapture?: ReactEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2426

#### Inherited from

`CodeEditorHostProps.onCanPlayThroughCapture`

---

### onChange? \{#onchange\}

```ts
onChange?: (value) => void;
```

Defined in: [packages/code-editor-react/src/CodeEditor.tsx:78](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/code-editor-react/src/CodeEditor.tsx#L78)

Content change caused by user editing. Programmatic writes (`value` sync) do **not** trigger it.

#### Parameters

| Parameter | Type     |
| --------- | -------- |
| `value`   | `string` |

#### Returns

`void`

#### Remarks

The callback is held in a ref and kept out of effect dependencies — when the host writes an inline arrow function,
every render produces a new reference, and putting it in the dependencies would reinstall the update listener on every render.

---

### onChangeCapture? \{#onchangecapture\}

```ts
onChangeCapture?: ChangeEventHandler<HTMLDivElement, Element>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2392

#### Inherited from

`CodeEditorHostProps.onChangeCapture`

---

### onClick? \{#onclick\}

```ts
onClick?: MouseEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2469

#### Inherited from

`CodeEditorHostProps.onClick`

---

### onClickCapture? \{#onclickcapture\}

```ts
onClickCapture?: MouseEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2470

#### Inherited from

`CodeEditorHostProps.onClickCapture`

---

### onCompositionEnd? \{#oncompositionend\}

```ts
onCompositionEnd?: CompositionEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2377

#### Inherited from

`CodeEditorHostProps.onCompositionEnd`

---

### onCompositionEndCapture? \{#oncompositionendcapture\}

```ts
onCompositionEndCapture?: CompositionEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2378

#### Inherited from

`CodeEditorHostProps.onCompositionEndCapture`

---

### onCompositionStart? \{#oncompositionstart\}

```ts
onCompositionStart?: CompositionEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2379

#### Inherited from

`CodeEditorHostProps.onCompositionStart`

---

### onCompositionStartCapture? \{#oncompositionstartcapture\}

```ts
onCompositionStartCapture?: CompositionEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2380

#### Inherited from

`CodeEditorHostProps.onCompositionStartCapture`

---

### onCompositionUpdate? \{#oncompositionupdate\}

```ts
onCompositionUpdate?: CompositionEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2381

#### Inherited from

`CodeEditorHostProps.onCompositionUpdate`

---

### onCompositionUpdateCapture? \{#oncompositionupdatecapture\}

```ts
onCompositionUpdateCapture?: CompositionEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2382

#### Inherited from

`CodeEditorHostProps.onCompositionUpdateCapture`

---

### onContextMenu? \{#oncontextmenu\}

```ts
onContextMenu?: MouseEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2471

#### Inherited from

`CodeEditorHostProps.onContextMenu`

---

### onContextMenuCapture? \{#oncontextmenucapture\}

```ts
onContextMenuCapture?: MouseEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2472

#### Inherited from

`CodeEditorHostProps.onContextMenuCapture`

---

### onCopy? \{#oncopy\}

```ts
onCopy?: ClipboardEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2369

#### Inherited from

`CodeEditorHostProps.onCopy`

---

### onCopyCapture? \{#oncopycapture\}

```ts
onCopyCapture?: ClipboardEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2370

#### Inherited from

`CodeEditorHostProps.onCopyCapture`

---

### onCut? \{#oncut\}

```ts
onCut?: ClipboardEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2371

#### Inherited from

`CodeEditorHostProps.onCut`

---

### onCutCapture? \{#oncutcapture\}

```ts
onCutCapture?: ClipboardEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2372

#### Inherited from

`CodeEditorHostProps.onCutCapture`

---

### onDoubleClick? \{#ondoubleclick\}

```ts
onDoubleClick?: MouseEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2473

#### Inherited from

`CodeEditorHostProps.onDoubleClick`

---

### onDoubleClickCapture? \{#ondoubleclickcapture\}

```ts
onDoubleClickCapture?: MouseEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2474

#### Inherited from

`CodeEditorHostProps.onDoubleClickCapture`

---

### onDrag? \{#ondrag\}

```ts
onDrag?: DragEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2475

#### Inherited from

`CodeEditorHostProps.onDrag`

---

### onDragCapture? \{#ondragcapture\}

```ts
onDragCapture?: DragEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2476

#### Inherited from

`CodeEditorHostProps.onDragCapture`

---

### onDragEnd? \{#ondragend\}

```ts
onDragEnd?: DragEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2477

#### Inherited from

`CodeEditorHostProps.onDragEnd`

---

### onDragEndCapture? \{#ondragendcapture\}

```ts
onDragEndCapture?: DragEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2478

#### Inherited from

`CodeEditorHostProps.onDragEndCapture`

---

### onDragEnter? \{#ondragenter\}

```ts
onDragEnter?: DragEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2479

#### Inherited from

`CodeEditorHostProps.onDragEnter`

---

### onDragEnterCapture? \{#ondragentercapture\}

```ts
onDragEnterCapture?: DragEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2480

#### Inherited from

`CodeEditorHostProps.onDragEnterCapture`

---

### onDragExit? \{#ondragexit\}

```ts
onDragExit?: DragEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2481

#### Inherited from

`CodeEditorHostProps.onDragExit`

---

### onDragExitCapture? \{#ondragexitcapture\}

```ts
onDragExitCapture?: DragEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2482

#### Inherited from

`CodeEditorHostProps.onDragExitCapture`

---

### onDragLeave? \{#ondragleave\}

```ts
onDragLeave?: DragEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2483

#### Inherited from

`CodeEditorHostProps.onDragLeave`

---

### onDragLeaveCapture? \{#ondragleavecapture\}

```ts
onDragLeaveCapture?: DragEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2484

#### Inherited from

`CodeEditorHostProps.onDragLeaveCapture`

---

### onDragOver? \{#ondragover\}

```ts
onDragOver?: DragEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2485

#### Inherited from

`CodeEditorHostProps.onDragOver`

---

### onDragOverCapture? \{#ondragovercapture\}

```ts
onDragOverCapture?: DragEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2486

#### Inherited from

`CodeEditorHostProps.onDragOverCapture`

---

### onDragStart? \{#ondragstart\}

```ts
onDragStart?: DragEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2487

#### Inherited from

`CodeEditorHostProps.onDragStart`

---

### onDragStartCapture? \{#ondragstartcapture\}

```ts
onDragStartCapture?: DragEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2488

#### Inherited from

`CodeEditorHostProps.onDragStartCapture`

---

### onDrop? \{#ondrop\}

```ts
onDrop?: DragEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2489

#### Inherited from

`CodeEditorHostProps.onDrop`

---

### onDropCapture? \{#ondropcapture\}

```ts
onDropCapture?: DragEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2490

#### Inherited from

`CodeEditorHostProps.onDropCapture`

---

### onDurationChange? \{#ondurationchange\}

```ts
onDurationChange?: ReactEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2427

#### Inherited from

`CodeEditorHostProps.onDurationChange`

---

### onDurationChangeCapture? \{#ondurationchangecapture\}

```ts
onDurationChangeCapture?: ReactEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2428

#### Inherited from

`CodeEditorHostProps.onDurationChangeCapture`

---

### onEmptied? \{#onemptied\}

```ts
onEmptied?: ReactEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2429

#### Inherited from

`CodeEditorHostProps.onEmptied`

---

### onEmptiedCapture? \{#onemptiedcapture\}

```ts
onEmptiedCapture?: ReactEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2430

#### Inherited from

`CodeEditorHostProps.onEmptiedCapture`

---

### onEncrypted? \{#onencrypted\}

```ts
onEncrypted?: ReactEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2431

#### Inherited from

`CodeEditorHostProps.onEncrypted`

---

### onEncryptedCapture? \{#onencryptedcapture\}

```ts
onEncryptedCapture?: ReactEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2432

#### Inherited from

`CodeEditorHostProps.onEncryptedCapture`

---

### onEnded? \{#onended\}

```ts
onEnded?: ReactEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2433

#### Inherited from

`CodeEditorHostProps.onEnded`

---

### onEndedCapture? \{#onendedcapture\}

```ts
onEndedCapture?: ReactEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2434

#### Inherited from

`CodeEditorHostProps.onEndedCapture`

---

### onError? \{#onerror\}

```ts
onError?: ReactEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2407

#### Inherited from

`CodeEditorHostProps.onError`

---

### onErrorCapture? \{#onerrorcapture\}

```ts
onErrorCapture?: ReactEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2408

#### Inherited from

`CodeEditorHostProps.onErrorCapture`

---

### onFocus? \{#onfocus\}

```ts
onFocus?: FocusEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2385

#### Inherited from

`CodeEditorHostProps.onFocus`

---

### onFocusCapture? \{#onfocuscapture\}

```ts
onFocusCapture?: FocusEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2386

#### Inherited from

`CodeEditorHostProps.onFocusCapture`

---

### onGotPointerCapture? \{#ongotpointercapture\}

```ts
onGotPointerCapture?: PointerEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2533

#### Inherited from

`CodeEditorHostProps.onGotPointerCapture`

---

### onGotPointerCaptureCapture? \{#ongotpointercapturecapture\}

```ts
onGotPointerCaptureCapture?: PointerEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2534

#### Inherited from

`CodeEditorHostProps.onGotPointerCaptureCapture`

---

### onInput? \{#oninput\}

```ts
onInput?: InputEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2395

#### Inherited from

`CodeEditorHostProps.onInput`

---

### onInputCapture? \{#oninputcapture\}

```ts
onInputCapture?: InputEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2396

#### Inherited from

`CodeEditorHostProps.onInputCapture`

---

### onInvalid? \{#oninvalid\}

```ts
onInvalid?: ReactEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2401

#### Inherited from

`CodeEditorHostProps.onInvalid`

---

### onInvalidCapture? \{#oninvalidcapture\}

```ts
onInvalidCapture?: ReactEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2402

#### Inherited from

`CodeEditorHostProps.onInvalidCapture`

---

### onKeyDown? \{#onkeydown\}

```ts
onKeyDown?: KeyboardEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2411

#### Inherited from

`CodeEditorHostProps.onKeyDown`

---

### onKeyDownCapture? \{#onkeydowncapture\}

```ts
onKeyDownCapture?: KeyboardEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2412

#### Inherited from

`CodeEditorHostProps.onKeyDownCapture`

---

### ~~onKeyPress?~~ \{#onkeypress\}

```ts
onKeyPress?: KeyboardEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2414

#### Deprecated

Use `onKeyUp` or `onKeyDown` instead

#### Inherited from

`CodeEditorHostProps.onKeyPress`

---

### ~~onKeyPressCapture?~~ \{#onkeypresscapture\}

```ts
onKeyPressCapture?: KeyboardEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2416

#### Deprecated

Use `onKeyUpCapture` or `onKeyDownCapture` instead

#### Inherited from

`CodeEditorHostProps.onKeyPressCapture`

---

### onKeyUp? \{#onkeyup\}

```ts
onKeyUp?: KeyboardEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2417

#### Inherited from

`CodeEditorHostProps.onKeyUp`

---

### onKeyUpCapture? \{#onkeyupcapture\}

```ts
onKeyUpCapture?: KeyboardEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2418

#### Inherited from

`CodeEditorHostProps.onKeyUpCapture`

---

### onLanguageError? \{#onlanguageerror\}

```ts
onLanguageError?: (error) => void;
```

Defined in: [packages/code-editor-react/src/CodeEditor.tsx:196](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/code-editor-react/src/CodeEditor.tsx#L196)

Language resolution or loading failed.

#### Parameters

| Parameter | Type                                                                                 |
| --------- | ------------------------------------------------------------------------------------ |
| `error`   | [`CodeEditorLanguageError`](../../code-editor/interfaces/CodeEditorLanguageError.md) |

#### Returns

`void`

#### Remarks

CER-004: this path previously only had a `console.error`, completely unobservable to the host —
no error to grab, no chance to retry or degrade, the user just sees highlighting suddenly vanish.
The degradation strategy is unchanged (clear the language extension and fall back to plain text) and the log is kept; this callback is the **newly added** observation channel.
Same payload as Angular's `aoLanguageError` output and Vue's `language-error` event.

Like `onChange`, it is held in a ref and kept out of the language effect's dependencies.

---

### onLoad? \{#onload\}

```ts
onLoad?: ReactEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2405

#### Inherited from

`CodeEditorHostProps.onLoad`

---

### onLoadCapture? \{#onloadcapture\}

```ts
onLoadCapture?: ReactEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2406

#### Inherited from

`CodeEditorHostProps.onLoadCapture`

---

### onLoadedData? \{#onloadeddata\}

```ts
onLoadedData?: ReactEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2435

#### Inherited from

`CodeEditorHostProps.onLoadedData`

---

### onLoadedDataCapture? \{#onloadeddatacapture\}

```ts
onLoadedDataCapture?: ReactEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2436

#### Inherited from

`CodeEditorHostProps.onLoadedDataCapture`

---

### onLoadedMetadata? \{#onloadedmetadata\}

```ts
onLoadedMetadata?: ReactEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2437

#### Inherited from

`CodeEditorHostProps.onLoadedMetadata`

---

### onLoadedMetadataCapture? \{#onloadedmetadatacapture\}

```ts
onLoadedMetadataCapture?: ReactEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2438

#### Inherited from

`CodeEditorHostProps.onLoadedMetadataCapture`

---

### onLoadStart? \{#onloadstart\}

```ts
onLoadStart?: ReactEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2439

#### Inherited from

`CodeEditorHostProps.onLoadStart`

---

### onLoadStartCapture? \{#onloadstartcapture\}

```ts
onLoadStartCapture?: ReactEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2440

#### Inherited from

`CodeEditorHostProps.onLoadStartCapture`

---

### onLostPointerCapture? \{#onlostpointercapture\}

```ts
onLostPointerCapture?: PointerEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2535

#### Inherited from

`CodeEditorHostProps.onLostPointerCapture`

---

### onLostPointerCaptureCapture? \{#onlostpointercapturecapture\}

```ts
onLostPointerCaptureCapture?: PointerEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2536

#### Inherited from

`CodeEditorHostProps.onLostPointerCaptureCapture`

---

### onMouseDown? \{#onmousedown\}

```ts
onMouseDown?: MouseEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2491

#### Inherited from

`CodeEditorHostProps.onMouseDown`

---

### onMouseDownCapture? \{#onmousedowncapture\}

```ts
onMouseDownCapture?: MouseEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2492

#### Inherited from

`CodeEditorHostProps.onMouseDownCapture`

---

### onMouseEnter? \{#onmouseenter\}

```ts
onMouseEnter?: MouseEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2493

#### Inherited from

`CodeEditorHostProps.onMouseEnter`

---

### onMouseLeave? \{#onmouseleave\}

```ts
onMouseLeave?: MouseEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2494

#### Inherited from

`CodeEditorHostProps.onMouseLeave`

---

### onMouseMove? \{#onmousemove\}

```ts
onMouseMove?: MouseEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2495

#### Inherited from

`CodeEditorHostProps.onMouseMove`

---

### onMouseMoveCapture? \{#onmousemovecapture\}

```ts
onMouseMoveCapture?: MouseEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2496

#### Inherited from

`CodeEditorHostProps.onMouseMoveCapture`

---

### onMouseOut? \{#onmouseout\}

```ts
onMouseOut?: MouseEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2497

#### Inherited from

`CodeEditorHostProps.onMouseOut`

---

### onMouseOutCapture? \{#onmouseoutcapture\}

```ts
onMouseOutCapture?: MouseEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2498

#### Inherited from

`CodeEditorHostProps.onMouseOutCapture`

---

### onMouseOver? \{#onmouseover\}

```ts
onMouseOver?: MouseEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2499

#### Inherited from

`CodeEditorHostProps.onMouseOver`

---

### onMouseOverCapture? \{#onmouseovercapture\}

```ts
onMouseOverCapture?: MouseEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2500

#### Inherited from

`CodeEditorHostProps.onMouseOverCapture`

---

### onMouseUp? \{#onmouseup\}

```ts
onMouseUp?: MouseEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2501

#### Inherited from

`CodeEditorHostProps.onMouseUp`

---

### onMouseUpCapture? \{#onmouseupcapture\}

```ts
onMouseUpCapture?: MouseEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2502

#### Inherited from

`CodeEditorHostProps.onMouseUpCapture`

---

### onPaste? \{#onpaste\}

```ts
onPaste?: ClipboardEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2373

#### Inherited from

`CodeEditorHostProps.onPaste`

---

### onPasteCapture? \{#onpastecapture\}

```ts
onPasteCapture?: ClipboardEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2374

#### Inherited from

`CodeEditorHostProps.onPasteCapture`

---

### onPause? \{#onpause\}

```ts
onPause?: ReactEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2441

#### Inherited from

`CodeEditorHostProps.onPause`

---

### onPauseCapture? \{#onpausecapture\}

```ts
onPauseCapture?: ReactEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2442

#### Inherited from

`CodeEditorHostProps.onPauseCapture`

---

### onPlay? \{#onplay\}

```ts
onPlay?: ReactEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2443

#### Inherited from

`CodeEditorHostProps.onPlay`

---

### onPlayCapture? \{#onplaycapture\}

```ts
onPlayCapture?: ReactEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2444

#### Inherited from

`CodeEditorHostProps.onPlayCapture`

---

### onPlaying? \{#onplaying\}

```ts
onPlaying?: ReactEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2445

#### Inherited from

`CodeEditorHostProps.onPlaying`

---

### onPlayingCapture? \{#onplayingcapture\}

```ts
onPlayingCapture?: ReactEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2446

#### Inherited from

`CodeEditorHostProps.onPlayingCapture`

---

### onPointerCancel? \{#onpointercancel\}

```ts
onPointerCancel?: PointerEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2525

#### Inherited from

`CodeEditorHostProps.onPointerCancel`

---

### onPointerCancelCapture? \{#onpointercancelcapture\}

```ts
onPointerCancelCapture?: PointerEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2526

#### Inherited from

`CodeEditorHostProps.onPointerCancelCapture`

---

### onPointerDown? \{#onpointerdown\}

```ts
onPointerDown?: PointerEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2519

#### Inherited from

`CodeEditorHostProps.onPointerDown`

---

### onPointerDownCapture? \{#onpointerdowncapture\}

```ts
onPointerDownCapture?: PointerEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2520

#### Inherited from

`CodeEditorHostProps.onPointerDownCapture`

---

### onPointerEnter? \{#onpointerenter\}

```ts
onPointerEnter?: PointerEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2527

#### Inherited from

`CodeEditorHostProps.onPointerEnter`

---

### onPointerLeave? \{#onpointerleave\}

```ts
onPointerLeave?: PointerEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2528

#### Inherited from

`CodeEditorHostProps.onPointerLeave`

---

### onPointerMove? \{#onpointermove\}

```ts
onPointerMove?: PointerEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2521

#### Inherited from

`CodeEditorHostProps.onPointerMove`

---

### onPointerMoveCapture? \{#onpointermovecapture\}

```ts
onPointerMoveCapture?: PointerEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2522

#### Inherited from

`CodeEditorHostProps.onPointerMoveCapture`

---

### onPointerOut? \{#onpointerout\}

```ts
onPointerOut?: PointerEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2531

#### Inherited from

`CodeEditorHostProps.onPointerOut`

---

### onPointerOutCapture? \{#onpointeroutcapture\}

```ts
onPointerOutCapture?: PointerEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2532

#### Inherited from

`CodeEditorHostProps.onPointerOutCapture`

---

### onPointerOver? \{#onpointerover\}

```ts
onPointerOver?: PointerEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2529

#### Inherited from

`CodeEditorHostProps.onPointerOver`

---

### onPointerOverCapture? \{#onpointerovercapture\}

```ts
onPointerOverCapture?: PointerEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2530

#### Inherited from

`CodeEditorHostProps.onPointerOverCapture`

---

### onPointerUp? \{#onpointerup\}

```ts
onPointerUp?: PointerEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2523

#### Inherited from

`CodeEditorHostProps.onPointerUp`

---

### onPointerUpCapture? \{#onpointerupcapture\}

```ts
onPointerUpCapture?: PointerEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2524

#### Inherited from

`CodeEditorHostProps.onPointerUpCapture`

---

### onProgress? \{#onprogress\}

```ts
onProgress?: ReactEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2447

#### Inherited from

`CodeEditorHostProps.onProgress`

---

### onProgressCapture? \{#onprogresscapture\}

```ts
onProgressCapture?: ReactEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2448

#### Inherited from

`CodeEditorHostProps.onProgressCapture`

---

### onRateChange? \{#onratechange\}

```ts
onRateChange?: ReactEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2449

#### Inherited from

`CodeEditorHostProps.onRateChange`

---

### onRateChangeCapture? \{#onratechangecapture\}

```ts
onRateChangeCapture?: ReactEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2450

#### Inherited from

`CodeEditorHostProps.onRateChangeCapture`

---

### onReset? \{#onreset\}

```ts
onReset?: ReactEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2397

#### Inherited from

`CodeEditorHostProps.onReset`

---

### onResetCapture? \{#onresetcapture\}

```ts
onResetCapture?: ReactEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2398

#### Inherited from

`CodeEditorHostProps.onResetCapture`

---

### onScroll? \{#onscroll\}

```ts
onScroll?: UIEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2539

#### Inherited from

`CodeEditorHostProps.onScroll`

---

### onScrollCapture? \{#onscrollcapture\}

```ts
onScrollCapture?: UIEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2540

#### Inherited from

`CodeEditorHostProps.onScrollCapture`

---

### onScrollEnd? \{#onscrollend\}

```ts
onScrollEnd?: UIEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2541

#### Inherited from

`CodeEditorHostProps.onScrollEnd`

---

### onScrollEndCapture? \{#onscrollendcapture\}

```ts
onScrollEndCapture?: UIEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2542

#### Inherited from

`CodeEditorHostProps.onScrollEndCapture`

---

### onSeeked? \{#onseeked\}

```ts
onSeeked?: ReactEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2451

#### Inherited from

`CodeEditorHostProps.onSeeked`

---

### onSeekedCapture? \{#onseekedcapture\}

```ts
onSeekedCapture?: ReactEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2452

#### Inherited from

`CodeEditorHostProps.onSeekedCapture`

---

### onSeeking? \{#onseeking\}

```ts
onSeeking?: ReactEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2453

#### Inherited from

`CodeEditorHostProps.onSeeking`

---

### onSeekingCapture? \{#onseekingcapture\}

```ts
onSeekingCapture?: ReactEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2454

#### Inherited from

`CodeEditorHostProps.onSeekingCapture`

---

### onSelect? \{#onselect\}

```ts
onSelect?: ReactEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2505

#### Inherited from

`CodeEditorHostProps.onSelect`

---

### onSelectCapture? \{#onselectcapture\}

```ts
onSelectCapture?: ReactEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2506

#### Inherited from

`CodeEditorHostProps.onSelectCapture`

---

### onStalled? \{#onstalled\}

```ts
onStalled?: ReactEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2455

#### Inherited from

`CodeEditorHostProps.onStalled`

---

### onStalledCapture? \{#onstalledcapture\}

```ts
onStalledCapture?: ReactEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2456

#### Inherited from

`CodeEditorHostProps.onStalledCapture`

---

### onSubmit? \{#onsubmit\}

```ts
onSubmit?: SubmitEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2399

#### Inherited from

`CodeEditorHostProps.onSubmit`

---

### onSubmitCapture? \{#onsubmitcapture\}

```ts
onSubmitCapture?: SubmitEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2400

#### Inherited from

`CodeEditorHostProps.onSubmitCapture`

---

### onSuspend? \{#onsuspend\}

```ts
onSuspend?: ReactEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2457

#### Inherited from

`CodeEditorHostProps.onSuspend`

---

### onSuspendCapture? \{#onsuspendcapture\}

```ts
onSuspendCapture?: ReactEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2458

#### Inherited from

`CodeEditorHostProps.onSuspendCapture`

---

### onTimeUpdate? \{#ontimeupdate\}

```ts
onTimeUpdate?: ReactEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2459

#### Inherited from

`CodeEditorHostProps.onTimeUpdate`

---

### onTimeUpdateCapture? \{#ontimeupdatecapture\}

```ts
onTimeUpdateCapture?: ReactEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2460

#### Inherited from

`CodeEditorHostProps.onTimeUpdateCapture`

---

### onToggle? \{#ontoggle\}

```ts
onToggle?: ToggleEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2557

#### Inherited from

`CodeEditorHostProps.onToggle`

---

### onTouchCancel? \{#ontouchcancel\}

```ts
onTouchCancel?: TouchEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2509

#### Inherited from

`CodeEditorHostProps.onTouchCancel`

---

### onTouchCancelCapture? \{#ontouchcancelcapture\}

```ts
onTouchCancelCapture?: TouchEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2510

#### Inherited from

`CodeEditorHostProps.onTouchCancelCapture`

---

### onTouchEnd? \{#ontouchend\}

```ts
onTouchEnd?: TouchEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2511

#### Inherited from

`CodeEditorHostProps.onTouchEnd`

---

### onTouchEndCapture? \{#ontouchendcapture\}

```ts
onTouchEndCapture?: TouchEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2512

#### Inherited from

`CodeEditorHostProps.onTouchEndCapture`

---

### onTouchMove? \{#ontouchmove\}

```ts
onTouchMove?: TouchEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2513

#### Inherited from

`CodeEditorHostProps.onTouchMove`

---

### onTouchMoveCapture? \{#ontouchmovecapture\}

```ts
onTouchMoveCapture?: TouchEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2514

#### Inherited from

`CodeEditorHostProps.onTouchMoveCapture`

---

### onTouchStart? \{#ontouchstart\}

```ts
onTouchStart?: TouchEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2515

#### Inherited from

`CodeEditorHostProps.onTouchStart`

---

### onTouchStartCapture? \{#ontouchstartcapture\}

```ts
onTouchStartCapture?: TouchEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2516

#### Inherited from

`CodeEditorHostProps.onTouchStartCapture`

---

### onTransitionCancel? \{#ontransitioncancel\}

```ts
onTransitionCancel?: TransitionEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2561

#### Inherited from

`CodeEditorHostProps.onTransitionCancel`

---

### onTransitionCancelCapture? \{#ontransitioncancelcapture\}

```ts
onTransitionCancelCapture?: TransitionEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2562

#### Inherited from

`CodeEditorHostProps.onTransitionCancelCapture`

---

### onTransitionEnd? \{#ontransitionend\}

```ts
onTransitionEnd?: TransitionEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2563

#### Inherited from

`CodeEditorHostProps.onTransitionEnd`

---

### onTransitionEndCapture? \{#ontransitionendcapture\}

```ts
onTransitionEndCapture?: TransitionEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2564

#### Inherited from

`CodeEditorHostProps.onTransitionEndCapture`

---

### onTransitionRun? \{#ontransitionrun\}

```ts
onTransitionRun?: TransitionEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2565

#### Inherited from

`CodeEditorHostProps.onTransitionRun`

---

### onTransitionRunCapture? \{#ontransitionruncapture\}

```ts
onTransitionRunCapture?: TransitionEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2566

#### Inherited from

`CodeEditorHostProps.onTransitionRunCapture`

---

### onTransitionStart? \{#ontransitionstart\}

```ts
onTransitionStart?: TransitionEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2567

#### Inherited from

`CodeEditorHostProps.onTransitionStart`

---

### onTransitionStartCapture? \{#ontransitionstartcapture\}

```ts
onTransitionStartCapture?: TransitionEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2568

#### Inherited from

`CodeEditorHostProps.onTransitionStartCapture`

---

### onVolumeChange? \{#onvolumechange\}

```ts
onVolumeChange?: ReactEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2461

#### Inherited from

`CodeEditorHostProps.onVolumeChange`

---

### onVolumeChangeCapture? \{#onvolumechangecapture\}

```ts
onVolumeChangeCapture?: ReactEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2462

#### Inherited from

`CodeEditorHostProps.onVolumeChangeCapture`

---

### onWaiting? \{#onwaiting\}

```ts
onWaiting?: ReactEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2463

#### Inherited from

`CodeEditorHostProps.onWaiting`

---

### onWaitingCapture? \{#onwaitingcapture\}

```ts
onWaitingCapture?: ReactEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2464

#### Inherited from

`CodeEditorHostProps.onWaitingCapture`

---

### onWheel? \{#onwheel\}

```ts
onWheel?: WheelEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2545

#### Inherited from

`CodeEditorHostProps.onWheel`

---

### onWheelCapture? \{#onwheelcapture\}

```ts
onWheelCapture?: WheelEventHandler<HTMLDivElement>;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2546

#### Inherited from

`CodeEditorHostProps.onWheelCapture`

---

### part? \{#part\}

```ts
part?: string;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2966

#### See

[https://developer.mozilla.org/en-US/docs/Web/HTML/Global\_attributes/part](https://developer.mozilla.org/en-US/docs/Web/HTML/Global_attributes/part)

#### Inherited from

`CodeEditorHostProps.part`

---

### placeholder? \{#placeholder\}

```ts
placeholder?: string;
```

Defined in: [packages/code-editor-react/src/CodeEditor.tsx:102](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/code-editor-react/src/CodeEditor.tsx#L102)

Placeholder text shown when the document is empty.

---

### popover? \{#popover\}

```ts
popover?: "" | "auto" | "manual" | "hint";
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2940

#### Inherited from

`CodeEditorHostProps.popover`

---

### popoverTarget? \{#popovertarget\}

```ts
popoverTarget?: string;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2942

#### Inherited from

`CodeEditorHostProps.popoverTarget`

---

### popoverTargetAction? \{#popovertargetaction\}

```ts
popoverTargetAction?: "hide" | "show" | "toggle";
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2941

#### Inherited from

`CodeEditorHostProps.popoverTargetAction`

---

### prefix? \{#prefix\}

```ts
prefix?: string;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2918

#### Inherited from

`CodeEditorHostProps.prefix`

---

### property? \{#property\}

```ts
property?: string;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2919

#### Inherited from

`CodeEditorHostProps.property`

---

### radioGroup? \{#radiogroup\}

```ts
radioGroup?: string;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2908

#### Inherited from

`CodeEditorHostProps.radioGroup`

---

### readonly? \{#readonly\}

```ts
readonly?: boolean;
```

Defined in: [packages/code-editor-react/src/CodeEditor.tsx:108](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/code-editor-react/src/CodeEditor.tsx#L108)

Read-only: still focusable, selectable, and copyable, but not editable.

#### Default Value

```ts
false;
```

---

### ref? \{#ref\}

```ts
ref?: Ref<CodeEditorHandle>;
```

Defined in: [packages/code-editor-react/src/CodeEditor.tsx:57](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/code-editor-react/src/CodeEditor.tsx#L57)

Imperative handle; see [CodeEditorHandle](CodeEditorHandle.md).

---

### rel? \{#rel\}

```ts
rel?: string;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2920

#### Inherited from

`CodeEditorHostProps.rel`

---

### resource? \{#resource\}

```ts
resource?: string;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2921

#### Inherited from

`CodeEditorHostProps.resource`

---

### results? \{#results\}

```ts
results?: number;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2935

#### Inherited from

`CodeEditorHostProps.results`

---

### rev? \{#rev\}

```ts
rev?: string;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2922

#### Inherited from

`CodeEditorHostProps.rev`

---

### role? \{#role\}

```ts
role?: AriaRole;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2911

#### Inherited from

`CodeEditorHostProps.role`

---

### root? \{#root\}

```ts
root?: Document | ShadowRoot;
```

Defined in: [packages/code-editor-react/src/CodeEditor.tsx:184](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/code-editor-react/src/CodeEditor.tsx#L184)

The DOM root CodeMirror is mounted in, for Shadow DOM scenarios.

#### Remarks

**Read on first mount only** — CodeMirror cannot change root after construction.
To change root, force a component rebuild with `key`.

---

### security? \{#security\}

```ts
security?: string;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2936

#### Inherited from

`CodeEditorHostProps.security`

---

### setup? \{#setup\}

```ts
setup?: CodeEditorSetup;
```

Defined in: [packages/code-editor-react/src/CodeEditor.tsx:143](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/code-editor-react/src/CodeEditor.tsx#L143)

CodeMirror preset extension set; `null` means no presets are loaded.

#### Default Value

```ts
'basic';
```

---

### slot? \{#slot\}

```ts
slot?: string;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2900

#### Inherited from

`CodeEditorHostProps.slot`

---

### spellCheck? \{#spellcheck\}

```ts
spellCheck?: Booleanish;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2901

#### Inherited from

`CodeEditorHostProps.spellCheck`

---

### style? \{#style\}

```ts
style?: CSSProperties;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2902

#### Inherited from

`CodeEditorHostProps.style`

---

### suppressContentEditableWarning? \{#suppresscontenteditablewarning\}

```ts
suppressContentEditableWarning?: boolean;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2883

#### Inherited from

`CodeEditorHostProps.suppressContentEditableWarning`

---

### suppressHydrationWarning? \{#suppresshydrationwarning\}

```ts
suppressHydrationWarning?: boolean;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2884

#### Inherited from

`CodeEditorHostProps.suppressHydrationWarning`

---

### tabIndex? \{#tabindex\}

```ts
tabIndex?: number;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2903

#### Inherited from

`CodeEditorHostProps.tabIndex`

---

### theme? \{#theme\}

```ts
theme?: CodeEditorTheme;
```

Defined in: [packages/code-editor-react/src/CodeEditor.tsx:84](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/code-editor-react/src/CodeEditor.tsx#L84)

Theme.

#### Default Value

```ts
'light';
```

---

### title? \{#title\}

```ts
title?: string;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2904

#### Inherited from

`CodeEditorHostProps.title`

---

### translate? \{#translate\}

```ts
translate?: "yes" | "no";
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2905

#### Inherited from

`CodeEditorHostProps.translate`

---

### typeof? \{#typeof\}

```ts
typeof?: string;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2923

#### Inherited from

`CodeEditorHostProps.typeof`

---

### unselectable? \{#unselectable\}

```ts
unselectable?: "off" | "on";
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2937

#### Inherited from

`CodeEditorHostProps.unselectable`

---

### value? \{#value\}

```ts
value?: string;
```

Defined in: [packages/code-editor-react/src/CodeEditor.tsx:71](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/code-editor-react/src/CodeEditor.tsx#L71)

Document content.

#### Default Value

```ts
'';
```

#### Remarks

**Not strictly controlled**: the component does not write user edits back into this prop, nor does it
force-flatten the document on every render. When this prop changes, only the delta between the common
prefix and suffix is synced (see
[computeMinimalDocumentChange](../../code-editor/functions/computeMinimalDocumentChange.md)); cursor, selection, and scroll position are preserved.
For controlled usage, store the `onChange` value in state and pass it back.

Inside `<Activity>`, the editor state (text, selection, undo history) is kept with the component state: after hide
and re-show you continue editing from the pre-hide state. If this prop changed while hidden, one delta sync under
the same rule runs on re-show; if unchanged, it does not overwrite the pre-hide document.

---

### vocab? \{#vocab\}

```ts
vocab?: string;
```

Defined in: node\_modules/.pnpm/@types+react@19.3.0/node\_modules/@types/react/index.d.ts:2924

#### Inherited from

`CodeEditorHostProps.vocab`
