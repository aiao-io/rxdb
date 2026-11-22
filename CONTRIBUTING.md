# Contributing to RxDB

Thank you for taking the time to contribute. This guide covers the workflow required to change code, documentation, packages, and examples in this repository.

Chinese readers can use the [简体中文贡献指南](CONTRIBUTING.zh-CN.md).

## Before you start

Read these documents first.

- [AI agent guide](AGENTS.md) for repository rules and engineering constraints
- [Requirements index](requirements/README.md) for stories, epics, plans, and delivery status
- [README](README.md) for package boundaries, examples, and common commands
- [English support plan](requirements/english-support-plan.md) for localization changes

## Engineering requirements

- Use TDD. Add a failing test before implementing behavior.
- Keep Angular, React, and Vue behavior and public APIs symmetric.
- Use strict TypeScript, avoid `any`, and leave lint with zero warnings.
- Keep functions focused and avoid unnecessary nesting.
- Maintain the repository coverage gates. Core packages require at least 90 percent coverage and other packages require at least 80 percent.
- Document new public exports with TSDoc. Write comments and TSDoc in `packages` in Chinese. Keep identifiers, code examples, and TSDoc tags in their original form. Put English usage notes in the package README.
- Run repository tasks through Nx with the `pnpm nx` prefix.

## Requirements and scope

Before starting a feature, identify the affected story, epic, package, application, or plan. Public package changes and their framework consumers belong in one reviewable scope. Candidate domain work follows the governance documented in `requirements/domain-research/README.md`.

Keep the change focused. Include implementation, tests, documentation, and migration notes required by the behavior change. Avoid unrelated formatting or configuration changes.

## Environment setup

Use Node.js 26 or newer and the pnpm version pinned in the root manifest. On Windows, keep the LF line endings specified in `.gitattributes` so that the wa-sqlite checksum matches during installation. [Tool versions](package.json)

```sh
pnpm install
```

The recommended editor extensions are listed in [.vscode/extensions.json](.vscode/extensions.json).

## Development

Choose an example application when you need a browser entry point.

```sh
pnpm nx serve dev-rxdb-angular
pnpm nx serve dev-rxdb-react
pnpm nx serve dev-rxdb-vue
```

Other useful targets include the Admin templates, the Board and P2P demos, the HTTP and Supabase examples, the Electron and Tauri hosts, and the documentation site.

```sh
pnpm nx serve rxdb-admin-template-angular
pnpm nx serve rxdb-admin-template-react
pnpm nx serve rxdb-admin-template-vue
pnpm nx serve website
```

Inspect available projects and targets with Nx.

```sh
pnpm nx show projects
pnpm nx show project <project-name>
```

## Testing

Run the smallest affected target during development.

```sh
pnpm nx test rxdb --watch
pnpm nx run rxdb:lint
pnpm nx run rxdb:typecheck
```

Run coverage for a package when the change affects its public behavior.

```sh
pnpm nx test rxdb --coverage
```

Install the Playwright browser dependencies before running browser or E2E targets.

```sh
pnpm exec playwright install --with-deps --only-shell
```

Before opening a pull request, run the repository gate.

```sh
pnpm test-all
```

The full gate runs affected lint, typecheck, test, memory, browser, build, lazy-backend, and E2E targets. If a task fails, inspect the failed task first and rerun the individual Nx target before changing application code.

## Git workflow

All changes are merged into `main` through a pull request. Use a feature branch, keep commits focused, and use Conventional Commits.

```sh
git config user.name "Your Name"
git config user.email "you@example.com"
pnpm commit
```

Pull requests use squash merge. Delete the feature branch after merging.

Changes to a candidate domain and its `packages/*` public packages are reviewed and merged together according to the domain governance rules.

## Pull requests

A pull request should include the following information.

- What changed and why.
- The affected packages, applications, or stories.
- Tests and Nx targets that were run.
- Coverage or API baseline effects when applicable.
- Migration notes for breaking changes.
- Evidence that Angular, React, and Vue remain symmetric for framework-related work.

Use the repository pull request template. Keep issue references in the `Related Stories` or issue section of the description and do not use a story ID as a GitHub issue number.

## Local package publishing

The workspace provides a local Verdaccio registry for testing package output.

```sh
pnpm nx local-registry
pnpm nx run-many --targets=build
pnpm publish-local
```

Install a local package from the registry in another project.

```sh
pnpm add @aiao/rxdb --registry http://localhost:4873
```

The registry is stopped with `Ctrl+C`. Restore any project-level registry configuration after testing.

## Troubleshooting

### Dependency installation

```sh
pnpm store prune
pnpm install
```

Keep the existing lockfile unless dependency maintenance is part of the change. Do not delete `pnpm-lock.yaml` as a general recovery step.

### Test or build failures

- Check the first failed Nx task and its full log.
- Rerun the individual target with `pnpm nx run <project>:<target>`.
- Treat EPIPE, worker crashes, and `The service was stopped` as possible concurrency failures and rerun serially before changing code.
- Use `pnpm nx reset` when the workspace cache is stale.

```sh
pnpm nx reset
pnpm nx graph
pnpm nx show project <project-name>
```

## Getting help

- Read the [documentation](https://rxdb.aiao.io/en/).
- Search [existing issues](https://github.com/aiao-io/rxdb/issues).
- Use the [bug report](https://github.com/aiao-io/rxdb/issues/new?template=bug_report.yml), [feature request](https://github.com/aiao-io/rxdb/issues/new?template=feature_request.yml), or [question form](https://github.com/aiao-io/rxdb/issues/new?template=question.yml).

## License

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
