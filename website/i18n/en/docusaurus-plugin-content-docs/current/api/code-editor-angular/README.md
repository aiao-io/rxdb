# code-editor-angular

A standalone Angular code editor based on CodeMirror 6, supporting Angular Forms, dynamic languages, themes, and editing state configuration.

## Installation

```bash
pnpm add @aiao/code-editor @aiao/code-editor-angular
```

`@aiao/code-editor` is a peer dependency whose lower bound rises together with this package's version — the `.d.ts` this package generates directly references the core package's `CodeEditorLanguageDescription` / `ResolvedCodeEditorLanguage` / `CodeEditorLanguageError`; installing against an older core package fails to compile on the consumer side.

## Usage

```ts
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CodeEditor } from '@aiao/code-editor-angular';

@Component({
  selector: 'app-root',
  imports: [FormsModule, CodeEditor],
  template: `
    <ao-code-editor [(ngModel)]="code" (aoChange)="onCodeChange($event)" language="typescript" theme="dark" />
  `
})
export class AppComponent {
  code = '';

  onCodeChange(value: string): void {
    console.log(value);
  }
}
```

## Reactive Forms

```ts
import { Component } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { CodeEditor } from '@aiao/code-editor-angular';

@Component({
  selector: 'app-editor',
  imports: [ReactiveFormsModule, CodeEditor],
  template: `<ao-code-editor [formControl]="code" label="SQL query" language="sql" />`
})
export class EditorComponent {
  code = new FormControl('select 1', { nonNullable: true });
}
```

`writeValue()` only accepts `string | null | undefined` (`null` / `undefined` are normalized to the empty string). Putting any other type into a `FormControl` throws a `TypeError` immediately instead of waiting for CodeMirror to blow up internally.

## Inputs

| Name                  | Type                                       | Default             | Description                                                              |
| --------------------- | ------------------------------------------ | ------------------- | ------------------------------------------------------------------------ |
| `value`               | `string`                                   | `''`                | Document content; the form wins when used with `ngModel` / `formControl` |
| `language`            | `string`                                   | `'sql'`             | Language name or alias; `''` and `'plaintext'` mean no highlighting      |
| `languages`           | `readonly CodeEditorLanguageDescription[]` | `SUPPORT_LANGUAGES` | Candidate language list                                                  |
| `theme`               | `'light' \| 'dark'`                        | `'light'`           | Theme                                                                    |
| `setup`               | `'basic' \| 'minimal' \| null`             | `'basic'`           | CodeMirror preset extension set                                          |
| `placeholder`         | `string`                                   | `''`                | Placeholder text shown when the document is empty                        |
| `disabled`            | `boolean`                                  | `false`             | Disabled (read-only and unfocusable)                                     |
| `readonly`            | `boolean`                                  | `false`             | Read-only (still focusable and selectable)                               |
| `lineWrapping`        | `boolean`                                  | `false`             | Line wrapping                                                            |
| `indentUnit`          | `string`                                   | `'  '`              | The string used for one level of indentation                             |
| `indentWithTab`       | `boolean`                                  | `false`             | Allow Tab indentation (sacrifices keyboard accessibility)                |
| `highlightWhitespace` | `boolean`                                  | `false`             | Show whitespace characters                                               |
| `label`               | `string`                                   | `''`                | `aria-label` of the inner textbox                                        |
| `labelledBy`          | `string`                                   | `''`                | `aria-labelledby` of the inner textbox                                   |
| `describedBy`         | `string`                                   | `''`                | `aria-describedby` of the inner textbox                                  |
| `autoFocus`           | `boolean`                                  | `false`             | **Initialization only**, see below                                       |
| `root`                | `Document \| ShadowRoot`                   | —                   | **Initialization only**, see below                                       |

The three `aria-*` inputs land on CodeMirror's `.cm-content` — that's the element carrying `role="textbox"`, not the host element. Empty strings are treated as "unset" and produce no attribute.

## Outputs

| Name              | Payload                   | Description                                                                      |
| ----------------- | ------------------------- | -------------------------------------------------------------------------------- |
| `aoChange`        | `string`                  | Content change caused by user editing; programmatic writes do **not** trigger it |
| `aoFocus`         | `void`                    | Gained focus                                                                     |
| `aoBlur`          | `void`                    | Lost focus; also marks the form as `touched`                                     |
| `aoLanguageError` | `CodeEditorLanguageError` | Language not found (`not-found`) or `load()` failed (`load-failed`)              |

On language failure the editor **degrades to plain text** and stays usable; the host can retry or prompt accordingly:

```html
<ao-code-editor (aoLanguageError)="onLanguageError($event)" [language]="lang" />
```

```ts
onLanguageError(error: CodeEditorLanguageError): void {
  if (error.kind === 'load-failed') this.retry(error.language);
}
```

## Initialization-only inputs

`autoFocus` and `root` are read only once, when `ngOnInit` constructs the `EditorView`; later changes are ignored — both correspond to construction-time decisions CodeMirror cannot reconfigure. To change `root`, rebuild the component with `@if`.

`autoFocus` is also constrained by accessibility state: it does **not** grab focus when `disabled` or `readonly` is true, otherwise the user gets a control that cannot be typed into and gives no clue why.

## disabled vs value precedence

`disabled` has **two independent sources**; the editor is disabled when either is true:

1. the `[disabled]` input on the template;
2. `setDisabledState()` called by the form (`FormControl.disable()` / `.enable()`).

They do not overwrite each other — Reactive Forms proactively calls `setDisabledState(false)` when the control is enabled; if the two were collapsed into one value, a template `[disabled]="true"` would be silently erased. To restore editability, both must be released.

When `value` and a form are both present, the form wins: `ngModel` / `formControl` write via `writeValue()`, which runs later than the `value` input. When only `value` is used without a form, it is a plain one-way input — the component does not write user edits back into it; use `(aoChange)` to refill it yourself.

## Imperative handle

The component instance exposes four members with the **same name and semantics** as React / Vue:

| Member    | Type                  | Description                                                               |
| --------- | --------------------- | ------------------------------------------------------------------------- |
| `view`    | `EditorView \| null`  | The underlying CodeMirror instance; `null` when uninitialized / destroyed |
| `host`    | `HTMLElement \| null` | The element CodeMirror is mounted in; same as above                       |
| `focus()` | `void`                | Hands keyboard focus to the editor; no-op when uninitialized              |
| `blur()`  | `void`                | Removes keyboard focus; no-op when uninitialized                          |

```ts
@Component({
  imports: [CodeEditor],
  template: `<ao-code-editor #editor language="sql" />`
})
export class HostComponent {
  private readonly editor = viewChild.required(CodeEditor);

  jumpIn(): void {
    this.editor().focus();
  }
}
```

`setExtensions(extensions)` is the supported entry for loading custom CodeMirror extensions. It **replaces wholesale** the previously passed batch and only affects the consumer's own slot — the component's theme, language, read-only state, and change callbacks are unaffected.

`setLanguage(name)` is the **unconditional reload** entry, for when the host swapped the loader implementation behind a same-named description; for everyday language switching use the `language` input (it skips equivalent duplicate loads).

Apart from these two methods and the handle members in the table above, the component provides no other imperative setters: document content, theme, placeholder, read-only, indentation, line wrapping, and whitespace highlighting are all configured via the same-named inputs under [Inputs](#inputs), and the editable state is controlled by the `disabled` input or the form control's disabled state.

## Fileoverview

Entry point of the `@aiao/code-editor-angular` package.

Exports the Angular `CodeEditor` component and the `CodeEditorSetup` and `CodeEditorTheme` types. Same name and semantics as the React / Vue bindings; all three frameworks share `@aiao/code-editor`'s language resolution and accessibility utilities.

## Example

```ts
import { CodeEditor } from '@aiao/code-editor-angular';
```

## Classes

| Class                               | Description                  |
| ----------------------------------- | ---------------------------- |
| [CodeEditor](classes/CodeEditor.md) | CodeEditor Angular component |

## Type Aliases

| Type Alias                                         | Description                      |
| -------------------------------------------------- | -------------------------------- |
| [CodeEditorSetup](type-aliases/CodeEditorSetup.md) | CodeMirror preset configuration. |
| [CodeEditorTheme](type-aliases/CodeEditorTheme.md) | CodeEditor theme type            |
