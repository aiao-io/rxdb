# code-editor

Shared language descriptions and theme types for CodeMirror 6 editor bindings.

## Features

- **Multi-language descriptions**: JavaScript, TypeScript, JSON, HTML, CSS, SQL, Markdown, Python, etc.
- **On-demand loading**: language parsers are loaded dynamically via `LanguageDescription.load()`
- **Unified lookup**: case-insensitive lookup by language name or alias
- **Zero framework dependency**: reusable across Angular, React, Vue, or other CodeMirror 6 integrations

## When to use

- When you need to load language support for a CodeMirror 6 editor
- When you need to share the same language list across multiple framework bindings
- When you need to pass custom language descriptions to framework bindings

## Framework integrations

This package does not create editor instances. For full components use:

- Angular: `@aiao/code-editor-angular`
- React: `@aiao/code-editor-react`
- Vue: `@aiao/code-editor-vue`

## Installation

```bash
npm install @aiao/code-editor
# or
pnpm add @aiao/code-editor
```

## Usage

```typescript
import { findLanguageByName, SUPPORT_LANGUAGES } from '@aiao/code-editor';

const language = findLanguageByName('typescript');

if (language === null) {
  throw new Error('Unsupported language');
}

const languageSupport = await language.load();
const availableLanguageNames = SUPPORT_LANGUAGES.map(item => item.name);
```

`findLanguageByName()` matches language names and aliases only; it does not look up by file extension or file name. The returned `languageSupport` can be handed to a specific framework binding or editor state as a CodeMirror extension.

To look up by file name, use CodeMirror's static method directly; `SUPPORT_LANGUAGES` can be passed as the input:

```typescript
import { SUPPORT_LANGUAGES } from '@aiao/code-editor';
import { LanguageDescription } from '@codemirror/language';

LanguageDescription.matchFilename(SUPPORT_LANGUAGES, 'icon.svg'); // XML
```

The language descriptions covered by this package merge in the aliases, extensions, and file name regexes of upstream `@codemirror/language-data`; the matching range is a superset of upstream.

## Aliases do not mean syntax support

`json5` is a **file type alias** of the JSON description (consistent with upstream `@codemirror/language-data`); the parser is still the strict `@codemirror/lang-json`. Opening a JSON5 file with it produces error nodes for comments, unquoted keys, and trailing commas — visible as broken highlighting and lint errors.

For a real JSON5 editing experience, implement `CodeEditorLanguageDescription` yourself and pass it through the framework binding's `languages` property — this package does not silently downgrade.

## Full examples

- [Angular example](https://github.com/aiao-io/rxdb/tree/main/apps/dev-rxdb-angular)
- [React example](https://github.com/aiao-io/rxdb/tree/main/apps/dev-rxdb-react)
- [Vue example](https://github.com/aiao-io/rxdb/tree/main/apps/dev-rxdb-vue)

## Interfaces

| Interface                                                                    | Description                                                                                        |
| ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| [CodeEditorAccessibilityState](interfaces/CodeEditorAccessibilityState.md)   | Input for computing the accessibility attributes of the inner textbox.                             |
| [CodeEditorLanguageDescription](interfaces/CodeEditorLanguageDescription.md) | -                                                                                                  |
| [CodeEditorLanguageError](interfaces/CodeEditorLanguageError.md)             | Structured description of a language failure.                                                      |
| [CodeEditorLanguageSupport](interfaces/CodeEditorLanguageSupport.md)         | -                                                                                                  |
| [DocumentChangeSpec](interfaces/DocumentChangeSpec.md)                       | Range and content of a document replacement; fields are compatible with CodeMirror's `ChangeSpec`. |

## Type Aliases

| Type Alias                                                                 | Description                        |
| -------------------------------------------------------------------------- | ---------------------------------- |
| [CodeEditorExtension](type-aliases/CodeEditorExtension.md)                 | -                                  |
| [CodeEditorLanguageErrorKind](type-aliases/CodeEditorLanguageErrorKind.md) | Category of a language failure.    |
| [CodeEditorTheme](type-aliases/CodeEditorTheme.md)                         | CodeEditor theme type              |
| [ResolvedCodeEditorLanguage](type-aliases/ResolvedCodeEditorLanguage.md)   | Result of one language resolution. |

## Variables

| Variable                                             | Description                                                                                                          |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| [CSS](variables/CSS.md)                              | -                                                                                                                    |
| [HTML](variables/HTML.md)                            | -                                                                                                                    |
| [JavaScript](variables/JavaScript.md)                | -                                                                                                                    |
| [JSON](variables/JSON.md)                            | JSON language description backed by the **strict JSON** parser from `@codemirror/lang-json`.                         |
| [JSX](variables/JSX.md)                              | -                                                                                                                    |
| [Markdown](variables/Markdown.md)                    | -                                                                                                                    |
| [PostgreSQL](variables/PostgreSQL.md)                | -                                                                                                                    |
| [Python](variables/Python.md)                        | -                                                                                                                    |
| [Sass](variables/Sass.md)                            | -                                                                                                                    |
| [SCSS](variables/SCSS.md)                            | -                                                                                                                    |
| [SQL](variables/SQL.md)                              | -                                                                                                                    |
| [SQLite](variables/SQLite.md)                        | -                                                                                                                    |
| [SUPPORT\_LANGUAGES](variables/SUPPORT_LANGUAGES.md) | All built-in language descriptions: upstream `@codemirror/language-data` languages plus the 15 covered by this repo. |
| [TSX](variables/TSX.md)                              | -                                                                                                                    |
| [TypeScript](variables/TypeScript.md)                | -                                                                                                                    |
| [XML](variables/XML.md)                              | -                                                                                                                    |

## Functions

| Function                                                                          | Description                                                                                                                  |
| --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| [buildCodeEditorContentAttributes](functions/buildCodeEditorContentAttributes.md) | Converts accessibility state into an attribute dictionary for `EditorView.contentAttributes`.                                |
| [codeEditorLanguageLoadFailed](functions/codeEditorLanguageLoadFailed.md)         | Builds the "language load failed" error payload.                                                                             |
| [codeEditorLanguageNotFound](functions/codeEditorLanguageNotFound.md)             | Builds the "language name not found" error payload.                                                                          |
| [computeMinimalDocumentChange](functions/computeMinimalDocumentChange.md)         | Computes the minimal replacement range that turns `current` into `next`.                                                     |
| [findLanguageByName](functions/findLanguageByName.md)                             | -                                                                                                                            |
| [isSameResolvedLanguage](functions/isSameResolvedLanguage.md)                     | Determines whether two resolution results are equivalent — equivalent means "no need to reload or reconfigure the language". |
| [resolveCodeEditorLanguage](functions/resolveCodeEditorLanguage.md)               | Resolves the language description that should currently be used.                                                             |
| [shouldAutoFocusCodeEditor](functions/shouldAutoFocusCodeEditor.md)               | Determines whether `autoFocus` should run at initialization.                                                                 |
