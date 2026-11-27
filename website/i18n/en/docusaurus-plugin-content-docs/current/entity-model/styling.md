# Styling

Component visuals come in two layers:

- **Component styles** (dialog positioning and resize handles, table sizing, drag indicators, and so on) ship with the component packages: Angular component styles are compiled into the component definitions by ng-packagr, nothing extra to import; React / Vue component styles are extracted by the build into one `dist/index.css`, which the JS artifacts do not reference — **you must import it once at the app entry**;
- **Utility class styles**: component templates use agreed utility classes (Tailwind + daisyUI class names). The component packages do not publish these; the consumer's styling pipeline generates them. A consumer without a styling pipeline gets **structurally complete components without utility styling** — this is documented behavior, not a defect.

## Conventions

- Styling pipeline: Tailwind CSS + [daisyUI](https://daisyui.com/) (`light` / `dark` themes). The consumer decides preflight, themes, and colors; the component packages output none of these;
- Each component package publishes a **Tailwind source registration entry** so Tailwind scans the component templates and generates the used utility classes on demand:
  - `@aiao/rxdb-model-angular/tailwind.css`
  - `@aiao/rxdb-model-react/tailwind.css`
  - `@aiao/rxdb-model-vue/tailwind.css`
- React / Vue additionally publish a compiled component style bundle:
  - `@aiao/rxdb-model-react/index.css`
  - `@aiao/rxdb-model-vue/index.css`
- The table engine (`@visactor/vtable`) is provided by consumers as a peer dependency and is not counted in the component package size.

## Integration steps

For React / Vue, first import the component style bundle at the app entry (e.g. `main.tsx` / `main.ts`); Angular skips this step:

```ts
import '@aiao/rxdb-model-react/index.css'; // Vue: '@aiao/rxdb-model-vue/index.css'
```

Then import the corresponding package's registration entry in the app's Tailwind entry (the style file that imports `tailwindcss`):

```css
/* Example for an Angular consumer */
@import 'tailwindcss';
@import '@aiao/rxdb-model-angular/tailwind.css';

@plugin 'daisyui' {
  themes:
    light --default,
    dark --prefersdark;
}
```

For React / Vue, swap in `@aiao/rxdb-model-react/tailwind.css` / `@aiao/rxdb-model-vue/tailwind.css`. The registration entries only declare `@source` (published dist / local source directories); they output no preflight, theme, or daisyUI themes.

### Micro frontends / Shadow DOM

When components render directly into a Shadow DOM, daisyUI's CSS variables must also be attached to `:host`. Orbit uses a native iframe document and uses `:root` like a standalone page:

```css
@plugin 'daisyui/index.js' {
  themes:
    light --default,
    dark --prefersdark;
  /* :is() is required: daisyUI concatenates root as a prefix */
  root: ':is(:host, :root)';
}
```

## Themes

- Light/dark follows daisyUI's `data-theme`; the table and query builder render from theme variables in dark / light modes with no flicker when switching.
- The query builder's **component theme** (replacement implementations for the field picker / operator picker / value input) is unrelated to CSS and is provided through each framework's theme injection mechanism:
  - Angular: `provideQueryBuilderTheme(theme)` (DI token `QUERY_BUILDER_THEME`);
  - React: `QueryBuilderThemeProvider` (context `QUERY_BUILDER_THEME`);
  - Vue: `provideQueryBuilderTheme(theme)` (injection key `QUERY_BUILDER_THEME`).
    Defaults to the built-in `DEFAULT_QUERY_BUILDER_THEME`.

## Behavior without a styling pipeline

The components work without importing Tailwind / daisyUI: structure, semantics (fieldset / legend, tab, aria states), and interaction all function normally — only the visual styling from utility classes is missing. To restore the visuals, integrate the registration entries as above. React / Vue's `index.css` is not part of the styling pipeline; import it whether or not you use Tailwind, otherwise the dialog and table layouts break.
