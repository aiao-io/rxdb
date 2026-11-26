# buildCodeEditorContentAttributes()

```ts
function buildCodeEditorContentAttributes(state): Record<string, string>;
```

Defined in: [accessibility.ts:61](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/code-editor/src/accessibility.ts#L61)

Converts accessibility state into an attribute dictionary for `EditorView.contentAttributes`.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `state` | [`CodeEditorAccessibilityState`](../interfaces/CodeEditorAccessibilityState.md) | The current accessibility state |

## Returns

`Record`&lt;`string`, `string`&gt;

Contains only attributes that **actually have values**; returns an empty object when nothing has a value

## Remarks

Empty strings never **produce an attribute**; they don't produce an empty attribute either: `aria-label=""` turns the textbox from "no accessible name" into "accessible name is an empty string", and some screen readers then stop falling back to `aria-labelledby` or surrounding text — accessibility gets worse.

`aria-disabled` only appears when disabled. Writing `aria-disabled="false"` is legal, but stacked with the `aria-readonly` CodeMirror writes itself it makes the "read-only" and "disabled" states harder to tell apart, so when not disabled it is simply omitted.

The return value is a fresh object and can be handed straight to `EditorView.contentAttributes.of(...)`. CodeMirror diffs the previous attributes against the current ones and removes the excess itself.

## Example

```ts
const attributes = buildCodeEditorContentAttributes({ disabled: true, label: 'Code input' });
// `{ 'aria-disabled': 'true', 'aria-label': 'Code input' }`
view.dispatch({ effects: a11yConf.reconfigure(EditorView.contentAttributes.of(attributes)) });
```
