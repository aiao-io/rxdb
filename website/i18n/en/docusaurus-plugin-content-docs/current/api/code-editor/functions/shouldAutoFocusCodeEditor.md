# shouldAutoFocusCodeEditor()

```ts
function shouldAutoFocusCodeEditor(state): boolean;
```

Defined in: [accessibility.ts:82](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/code-editor/src/accessibility.ts#L82)

Determines whether `autoFocus` should run at initialization.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `state` | \{ `disabled?`: `boolean`; `readonly?`: `boolean`; \} | Disabled / read-only state at initialization |
| `state.disabled?` | `boolean` | - |
| `state.readonly?` | `boolean` | - |

## Returns

`boolean`

`true` when it should auto-focus

## Remarks

Both `disabled` and `readonly` configure the editor as non-editable (`EditorView.editable.of(false)`); sending keyboard focus into it then leaves the user with a control that cannot be typed into and gives no clue why. This is a **user-visible behavior fix**: previously the editor grabbed focus anyway when `autoFocus` and `disabled` were given together, even grabbing it before the accessibility state sync (CEA-008). All three frameworks share this single decision to avoid diverging again.
