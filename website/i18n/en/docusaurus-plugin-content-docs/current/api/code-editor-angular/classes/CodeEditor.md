# CodeEditor

Defined in: [code-editor-angular/src/code-editor.ts:99](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/code-editor-angular/src/code-editor.ts#L99)

CodeEditor Angular component

Angular component for a CodeMirror 6-based code editor, supporting multiple languages and themes

## Example

```html
<ao-code-editor
  [(ngModel)]="code"
  language="typescript"
  theme="dark"
  (aoChange)="onCodeChange($event)"
/>
```

## Implements

- `OnInit`
- `ControlValueAccessor`
- `OnDestroy`
- `OnChanges`

## Constructors

### Constructor

```ts
new CodeEditor(): CodeEditor;
```

#### Returns

`CodeEditor`

## Properties

### \_ariaDisabled \{#_ariadisabled\}

```ts
protected readonly _ariaDisabled: Signal<"true" | null>;
```

Defined in: [code-editor-angular/src/code-editor.ts:202](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/code-editor-angular/src/code-editor.ts#L202)

**`Internal`**

`aria-disabled` on the host element.

Returns `null` when not disabled so Angular **removes** the attribute instead of writing `aria-disabled="false"`; the reasoning matches [buildCodeEditorContentAttributes](../../code-editor/functions/buildCodeEditorContentAttributes.md). `protected` is the visibility floor — host binding expressions cannot read `#` private fields.

***

### aoBlur \{#aoblur\}

```ts
aoBlur: OutputEmitterRef<void>;
```

Defined in: [code-editor-angular/src/code-editor.ts:276](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/code-editor-angular/src/code-editor.ts#L276)

The editor loses focus; also marks the form as touched.

***

### aoChange \{#aochange\}

```ts
aoChange: OutputEmitterRef<string>;
```

Defined in: [code-editor-angular/src/code-editor.ts:274](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/code-editor-angular/src/code-editor.ts#L274)

Document content changed (external writes don't trigger it; see External).

***

### aoFocus \{#aofocus\}

```ts
aoFocus: OutputEmitterRef<void>;
```

Defined in: [code-editor-angular/src/code-editor.ts:272](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/code-editor-angular/src/code-editor.ts#L272)

The editor gains focus.

***

### aoLanguageError \{#aolanguageerror\}

```ts
aoLanguageError: OutputEmitterRef<CodeEditorLanguageError>;
```

Defined in: [code-editor-angular/src/code-editor.ts:286](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/code-editor-angular/src/code-editor.ts#L286)

Language resolution or loading failed.

#### Remarks

CEA-007: this path previously only had a `console.error`, completely unobservable to the host — no error to grab, no chance to retry or degrade, the user just sees highlighting suddenly vanish. The degradation strategy is unchanged (clear the language extension and fall back to plain text) and the log is kept; this event is the **newly added** observation channel. Same payload as React's `onLanguageError` prop and Vue's `language-error` event.

***

### autoFocus \{#autofocus\}

```ts
autoFocus: InputSignalWithTransform<boolean, unknown>;
```

Defined in: [code-editor-angular/src/code-editor.ts:206](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/code-editor-angular/src/code-editor.ts#L206)

Focuses the editor immediately after initialization. **Initialization only**; later changes are ignored.

#### Default Value

```ts
false
```

***

### describedBy \{#describedby\}

```ts
describedBy: InputSignal<string>;
```

Defined in: [code-editor-angular/src/code-editor.ts:214](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/code-editor-angular/src/code-editor.ts#L214)

Id of the supplementary description element, written as the inner textbox's `aria-describedby`. Updatable dynamically.

#### Default Value

```ts
'' (empty string is treated as "unset" and produces no attribute)
```

#### Remarks

The attribute lands on CodeMirror's `.cm-content` — that's the element carrying `role="textbox"`, not this component's host element. Same name and semantics across all three frameworks.

***

### disabled \{#disabled\}

```ts
disabled: InputSignalWithTransform<boolean, unknown>;
```

Defined in: [code-editor-angular/src/code-editor.ts:223](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/code-editor-angular/src/code-editor.ts#L223)

Disables editing (read-only and unfocusable). Updatable dynamically.

#### Default Value

```ts
false
```

#### Remarks

`setDisabledState()` from the form is a **second independent source**; the editor is disabled when either is true. With Reactive Forms, disabling the control has the same effect as `[disabled]="true"` on the template, but releasing only one of the two does not restore editability — both must be released.

***

### highlightWhitespace \{#highlightwhitespace\}

```ts
highlightWhitespace: InputSignalWithTransform<boolean, unknown>;
```

Defined in: [code-editor-angular/src/code-editor.ts:225](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/code-editor-angular/src/code-editor.ts#L225)

Shows whitespace characters. Updatable dynamically.

#### Default Value

```ts
false
```

***

### indentUnit \{#indentunit\}

```ts
indentUnit: InputSignal<string>;
```

Defined in: [code-editor-angular/src/code-editor.ts:227](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/code-editor-angular/src/code-editor.ts#L227)

The string used for one level of indentation. Updatable dynamically.

#### Default Value

```ts
'  ' (two spaces, consistent across all three frameworks)
```

***

### indentWithTab \{#indentwithtab\}

```ts
indentWithTab: InputSignalWithTransform<boolean, unknown>;
```

Defined in: [code-editor-angular/src/code-editor.ts:229](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/code-editor-angular/src/code-editor.ts#L229)

Allows Tab-key indentation (sacrifices keyboard accessibility). Updatable dynamically.

#### Default Value

```ts
false
```

***

### label \{#label\}

```ts
label: InputSignal<string>;
```

Defined in: [code-editor-angular/src/code-editor.ts:240](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/code-editor-angular/src/code-editor.ts#L240)

Accessible name, written as the inner textbox's `aria-label`. Updatable dynamically.

#### Default Value

```ts
'' (empty string is treated as "unset" and produces no attribute)
```

#### Remarks

Lands in the same place as [CodeEditor.describedBy](#describedby).

***

### labelledBy \{#labelledby\}

```ts
labelledBy: InputSignal<string>;
```

Defined in: [code-editor-angular/src/code-editor.ts:247](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/code-editor-angular/src/code-editor.ts#L247)

Id of the element acting as the label, written as the inner textbox's `aria-labelledby`. Updatable dynamically.

#### Default Value

```ts
'' (empty string is treated as "unset" and produces no attribute)
```

#### Remarks

Lands in the same place as [CodeEditor.describedBy](#describedby).

***

### language \{#language\}

```ts
language: InputSignal<string>;
```

Defined in: [code-editor-angular/src/code-editor.ts:231](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/code-editor-angular/src/code-editor.ts#L231)

Language name for syntax highlighting; see [languages](#languages) for the values. `'plaintext'` means no highlighting. Updatable dynamically.

#### Default Value

```ts
'sql'
```

***

### languages \{#languages\}

```ts
languages: InputSignal<readonly CodeEditorLanguageDescription[]>;
```

Defined in: [code-editor-angular/src/code-editor.ts:233](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/code-editor-angular/src/code-editor.ts#L233)

Candidate language list. Updatable dynamically.

#### Default Value

```ts
SUPPORT_LANGUAGES
```

***

### lineWrapping \{#linewrapping\}

```ts
lineWrapping: InputSignalWithTransform<boolean, unknown>;
```

Defined in: [code-editor-angular/src/code-editor.ts:249](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/code-editor-angular/src/code-editor.ts#L249)

Line wrapping. Updatable dynamically.

#### Default Value

```ts
false
```

***

### placeholder \{#placeholder\}

```ts
placeholder: InputSignal<string>;
```

Defined in: [code-editor-angular/src/code-editor.ts:251](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/code-editor-angular/src/code-editor.ts#L251)

Placeholder text shown when the document is empty. Updatable dynamically.

#### Default Value

```ts
''
```

***

### readonly \{#readonly\}

```ts
readonly: InputSignalWithTransform<boolean, unknown>;
```

Defined in: [code-editor-angular/src/code-editor.ts:253](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/code-editor-angular/src/code-editor.ts#L253)

Read-only (still focusable and selectable). Updatable dynamically.

#### Default Value

```ts
false
```

***

### root \{#root\}

```ts
root: InputSignal<Document | ShadowRoot | undefined>;
```

Defined in: [code-editor-angular/src/code-editor.ts:255](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/code-editor-angular/src/code-editor.ts#L255)

The DOM root CodeMirror is mounted in, for Shadow DOM scenarios. **Initialization only**.

***

### setup \{#setup\}

```ts
setup: InputSignal<CodeEditorSetup>;
```

Defined in: [code-editor-angular/src/code-editor.ts:257](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/code-editor-angular/src/code-editor.ts#L257)

Preset extension set; `null` means no presets are loaded. Updatable dynamically.

#### Default Value

```ts
'basic'
```

***

### theme \{#theme\}

```ts
theme: InputSignal<CodeEditorTheme>;
```

Defined in: [code-editor-angular/src/code-editor.ts:259](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/code-editor-angular/src/code-editor.ts#L259)

Theme. Updatable dynamically.

#### Default Value

```ts
'light'
```

***

### value \{#value\}

```ts
value: InputSignal<string>;
```

Defined in: [code-editor-angular/src/code-editor.ts:268](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/code-editor-angular/src/code-editor.ts#L268)

Document content. Externally driven when used as a controlled input; the form wins when used together with `ngModel`/`FormControl`.

#### Default Value

```ts
''
```

#### Remarks

RV-071: once [writeValue](#writevalue) has been called (i.e. the host bound `ngModel` or `formControl`), the form takes ownership of the value and later changes to this input no longer overwrite the document; without a form directive it remains a one-way external drive, see CodeEditor.#formOwnsValue.

## Accessors

### host \{#host\}

#### Get Signature

```ts
get host(): HTMLElement | null;
```

Defined in: [code-editor-angular/src/code-editor.ts:304](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/code-editor-angular/src/code-editor.ts#L304)

The host element CodeMirror is mounted in; `null` when uninitialized or destroyed.

##### Remarks

Angular's host is the `<ao-code-editor>` element itself; in React / Vue it is the `div` rendered by the component — different types but the same semantics: "which element CodeMirror is mounted in".

##### Returns

`HTMLElement` \| `null`

***

### view \{#view\}

#### Get Signature

```ts
get view(): EditorView | null;
```

Defined in: [code-editor-angular/src/code-editor.ts:293](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/code-editor-angular/src/code-editor.ts#L293)

The underlying CodeMirror `EditorView`; `null` when uninitialized or destroyed.

##### Remarks

The imperative surface is unified across all three frameworks as `view` / `host` / `focus()` / `blur()` (CEA-009).

##### Returns

`EditorView` \| `null`

## Methods

### \_dispatch\_effects() \{#_dispatch_effects\}

```ts
protected _dispatch_effects(effects): void | undefined;
```

Defined in: [code-editor-angular/src/code-editor.ts:563](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/code-editor-angular/src/code-editor.ts#L563)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `effects` | \| `StateEffect`&lt;`unknown`&gt; \| readonly `StateEffect`&lt;`unknown`&gt;[] |

#### Returns

`void` \| `undefined`

***

### \_get\_all\_extensions() \{#_get_all_extensions\}

```ts
protected _get_all_extensions(): Extension[];
```

Defined in: [code-editor-angular/src/code-editor.ts:541](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/code-editor-angular/src/code-editor.ts#L541)

#### Returns

`Extension`[]

***

### blur() \{#blur\}

```ts
blur(): void;
```

Defined in: [code-editor-angular/src/code-editor.ts:314](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/code-editor-angular/src/code-editor.ts#L314)

Removes keyboard focus. No-op when uninitialized.

#### Returns

`void`

***

### focus() \{#focus\}

```ts
focus(): void;
```

Defined in: [code-editor-angular/src/code-editor.ts:309](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/code-editor-angular/src/code-editor.ts#L309)

Hands keyboard focus to the editor. No-op when uninitialized.

#### Returns

`void`

***

### ngOnChanges() \{#ngonchanges\}

```ts
ngOnChanges(changes): void;
```

Defined in: [code-editor-angular/src/code-editor.ts:352](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/code-editor-angular/src/code-editor.ts#L352)

A callback method that is invoked immediately after the
default change detector has checked data-bound properties
if at least one has changed, and before the view and content
children are checked.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `changes` | \{ \[`propName`: `string`\]: `SimpleChange`&lt;`any`&gt;; \} | The changed properties. |

#### Returns

`void`

#### Implementation of

`OnChanges.ngOnChanges`

***

### ngOnDestroy() \{#ngondestroy\}

```ts
ngOnDestroy(): void;
```

Defined in: [code-editor-angular/src/code-editor.ts:407](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/code-editor-angular/src/code-editor.ts#L407)

A callback method that performs custom clean-up, invoked immediately
before a directive, pipe, or service instance is destroyed.

#### Returns

`void`

#### Implementation of

`OnDestroy.ngOnDestroy`

***

### ngOnInit() \{#ngoninit\}

```ts
ngOnInit(): void;
```

Defined in: [code-editor-angular/src/code-editor.ts:318](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/code-editor-angular/src/code-editor.ts#L318)

A callback method that is invoked immediately after the
default change detector has checked the directive's
data-bound properties for the first time,
and before any of the view or content children have been checked.
It is invoked only once when the directive is instantiated.

#### Returns

`void`

#### Implementation of

`OnInit.ngOnInit`

***

### registerOnChange() \{#registeronchange\}

```ts
registerOnChange(fn): void;
```

Defined in: [code-editor-angular/src/code-editor.ts:444](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/code-editor-angular/src/code-editor.ts#L444)

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `fn` | (`value`) => `void` | The callback function to register |

#### Returns

`void`

#### Description

Registers a callback function that is called when the control's value
changes in the UI.

This method is called by the forms API on initialization to update the form
model when values propagate from the view to the model.

When implementing the `registerOnChange` method in your own value accessor,
save the given function so your class calls it at the appropriate time.

#### Usage Notes

### Store the change function

The following example stores the provided function as an internal method.

```ts
registerOnChange(fn: (_: any) => void): void {
  this._onChange = fn;
}
```

When the value changes in the UI, call the registered
function to allow the forms API to update itself:

```ts
host: {
   '(change)': '_onChange($event.target.value)'
}
```

#### Implementation of

`ControlValueAccessor.registerOnChange`

***

### registerOnTouched() \{#registerontouched\}

```ts
registerOnTouched(fn): void;
```

Defined in: [code-editor-angular/src/code-editor.ts:448](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/code-editor-angular/src/code-editor.ts#L448)

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `fn` | () => `void` | The callback function to register |

#### Returns

`void`

#### Description

Registers a callback function that is called by the forms API on initialization
to update the form model on blur.

When implementing `registerOnTouched` in your own value accessor, save the given
function so your class calls it when the control should be considered
blurred or "touched".

#### Usage Notes

### Store the callback function

The following example stores the provided function as an internal method.

```ts
registerOnTouched(fn: any): void {
  this._onTouched = fn;
}
```

On blur (or equivalent), your class should call the registered function to allow
the forms API to update itself:

```ts
host: {
   '(blur)': '_onTouched()'
}
```

#### Implementation of

`ControlValueAccessor.registerOnTouched`

***

### setDisabledState() \{#setdisabledstate\}

```ts
setDisabledState(isDisabled): void;
```

Defined in: [code-editor-angular/src/code-editor.ts:458](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/code-editor-angular/src/code-editor.ts#L458)

The form-side disable switch, called by Angular Forms.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `isDisabled` | `boolean` |

#### Returns

`void`

#### Remarks

Writes only the CodeEditor.#formDisabled source; the `[disabled]` input on the template is another independent source, and the two are OR-ed together; see CodeEditor.#effectiveDisabled.

#### Implementation of

`ControlValueAccessor.setDisabledState`

***

### setExtensions() \{#setextensions\}

```ts
setExtensions(value): void;
```

Defined in: [code-editor-angular/src/code-editor.ts:475](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/code-editor-angular/src/code-editor.ts#L475)

Loads the consumer's own CodeMirror extensions.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `value` | `Extension`[] | The extensions to take effect this time; **replaces wholesale** the previously passed batch — pass `[]` to remove them all |

#### Returns

`void`

#### Remarks

CEA-003: previously this dispatched the global `StateEffect.reconfigure.of(value)`, which replaces the **entire extension tree** — one call wipes the updateListener, all Compartments, theme, language, and a11y attributes; called "set extensions", it actually "destroys the editor configuration". Now only the dedicated CodeEditor.#userExtensionsConf slot is reconfigured; the component's own configuration and the consumer's extensions don't affect each other.

***

### setLanguage() \{#setlanguage\}

```ts
setLanguage(lang): void;
```

Defined in: [code-editor-angular/src/code-editor.ts:492](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/code-editor-angular/src/code-editor.ts#L492)

Imperatively (re)applies the language configuration.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `lang` | `string` | Language name or alias; an empty string and `'plaintext'` mean no highlighting |

#### Returns

`void`

#### Remarks

**Unconditionally reloads**, even when the resolution result is identical to what is currently effective — this is the explicit reload entry for when the host swapped the loader implementation behind a same-named description; the `language` input cannot do it (it goes through the equivalence check in CodeEditor.#syncLanguage, CEA-006, and won't reload). For everyday language switching, change the `language` input instead.

On resolution failure, clears the language extension, falls back to plain text, and reports via [CodeEditor.aoLanguageError](#aolanguageerror).

***

### writeValue() \{#writevalue\}

```ts
writeValue(value): void;
```

Defined in: [code-editor-angular/src/code-editor.ts:427](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/code-editor-angular/src/code-editor.ts#L427)

The write entry of `ControlValueAccessor`, called by Angular Forms.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `value` | `unknown` | `null` / `undefined` are normalized to the empty string; a `string` is written as-is |

#### Returns

`void`

#### Throws

TypeError thrown immediately on any other type; the error message includes the package name and the actual type

#### Remarks

CEA-005: the signature was previously written as `string | null`, but the CVA contract is `any` — Angular does **no** runtime validation and delivers whatever is in the `FormControl` here as-is. The type annotation only fooled the compiler. So `FormControl(42)` blew up at `EditorState.create` via `#pendingValue` before initialization, and at `computeMinimalDocumentChange` after initialization — one misconfiguration, two timings, two different errors, neither pointing back to `writeValue`. Now both timings throw the same error, naming the package and the type directly.

#### Implementation of

`ControlValueAccessor.writeValue`
