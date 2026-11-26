# Capabilities and examples

The repository contains complete examples for Angular, React, and Vue. Each application uses the same entity model and database capabilities while keeping framework-specific binding code in its own application.

## Start a framework example

```bash
pnpm nx serve dev-rxdb-angular
pnpm nx serve dev-rxdb-react
pnpm nx serve dev-rxdb-vue
```

The examples include entity forms, reactive queries, file management, history, client internationalization, and the Admin shell integration.

## Workspace checks

Run tasks through Nx.

```bash
pnpm nx test <project>
pnpm nx lint <project>
pnpm nx typecheck <project>
pnpm test-all
```

The final command runs the affected workspace gates. See the repository [contribution guide](https://github.com/aiao-io/rxdb/blob/main/CONTRIBUTING.md) for the complete review and quality rules.
