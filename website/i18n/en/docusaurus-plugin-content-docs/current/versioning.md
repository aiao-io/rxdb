# Versioning and API stability

This page defines the versioning conventions, public API surface, deprecation cycle, and breaking-change review process for the Aiao packages. It is also the public face of [`requirements/versioning-policy.md`](https://github.com/aiao-io/rxdb/blob/main/requirements/versioning-policy.md) in the repository.

## semver conventions

Aiao follows [semver 2.0](https://semver.org/lang/zh-CN/): `major.minor.patch`.

- **Patch** (`0.0.x`): backward-compatible bug fixes.
- **Minor** (`0.x.0`): backward-compatible new features.
- **Major** (`x.0.0`): breaking changes.

### The 0.x phase (current)

The project is currently in `0.x`; the published npm version of the core packages is `0.0.28`. The workspace uses one unified version number, but the Admin, I18n, Board, and P2P package families added on main are not yet part of the npm release set — do not judge installability from the version numbers in the source manifest alone. Per semver, **during 0.x a minor version may contain breaking changes**; the public API is not yet frozen. A 1.0 release marks the start of stable maintenance; from then on, breaking changes only ship with major versions.

### Unified versioning

All published `@aiao/*` packages form a **fixed release group** and share one version number. Upgrade them together; do not mix versions.

## The public API surface

"Public API" = the symbols exported from each package's `src/index.ts` (and its declared subpath entries) that are not marked `@internal`.

**Not** public API — changeable at any time without counting as breaking:

- Internal implementations not exported from the package entry
- Symbols marked `@internal` / `@alpha` / `@experimental`
- Internal file structure of `dist`, bundle artifact layout
- Test fixture packages (e.g. `@aiao/rxdb-test`)

Framework-related public APIs must stay **symmetric across Angular / React / Vue**: a missing framework counts as unfinished, not as "not provided on that framework".

## Deprecation cycle

1. Symbols planned for removal are first marked `@deprecated`, with the alternative given in the TSDoc.
2. A deprecated symbol stays for at least **one minor version** (one major-version cycle after 1.0) before removal.
3. Removal happens in a breaking version and is recorded in the [migration guide](/migration/v1.md).

Example (a real export from `@aiao/rxdb`):

```typescript
/**
 * @deprecated Kept only to avoid breaking the export surface: it is not in {@link RxDBEventMap},
 * and nothing in the repository dispatches it, so subscribing never receives anything.
 * Use {@link REMOTE_ENTITY_INVALIDATED_EVENT} to observe remote changes.
 */
export const REMOTE_CHANGES_PENDING_EVENT = 'REMOTE_CHANGES_PENDING' as const;
```

## Breaking-change review process

The public API surface is guarded by **API baseline snapshots**, with **main entries and subpath entries treated equally**:

1. Each public package records its exported symbol surface in `requirements/api-baseline/<pkg>.json`, one record for the main entry
   (`@aiao/rxdb-plugin-graph`) and one per subpath entry (`@aiao/rxdb-plugin-graph/sqlite`).
2. CI compares against the baseline on every change with `scripts/audit/api-surface.mjs --check`.
3. An undeclared surface change → **check fails**. A missing export on a subpath, or an entire subpath entry disappearing, counts as breaking, under the same grading as the main entry.
4. For a genuinely intended change: update the baseline snapshot, mark whether the PR is breaking, and add migration notes where needed.

:::note Every subpath entry in `exports` is in the baseline

The only exception is asset entries with no export surface — see the next paragraph.

`api-surface.mjs` also has an asset-entry whitelist (`ASSET_SUBPATHS`): such entries (wasm / CSS / worker scripts) have no export surface to scan, so they can only be skipped explicitly, with their contents guarded by supply-chain audits instead. The whitelist currently registers 6 entries across 4 packages —
`@aiao/rxdb-adapter-miniprogram`'s `./alipay-random-worker.js`, `@aiao/rxdb-model-angular`'s `./tailwind.css`,
`@aiao/rxdb-model-{react,vue}`'s `./index.css` and `./tailwind.css` — and it is checked in both directions:
an entry registered for a path that no longer exists in the package, or a registered package that has left the scan scope, also fails the gate.

:::

Public types additionally have compile-time contract tests (e.g. `@aiao/rxdb`'s `public-type-compatibility` test and each package's `public-contract` consumers) that prevent accidental breakage from both the type and runtime dimensions.

## How a version level is decided

- Commits follow [Conventional Commits](https://www.conventionalcommits.org/zh-hans/): `fix:` → patch, `feat:` → minor, `feat!:` / `BREAKING CHANGE:` → major.
- Releases are performed manually by maintainers; the version number is specified explicitly during 0.x (Nx downgrades `feat:` to patch while major is 0).
- A breaking diff in the API baseline fails the PR check; breaking changes must be declared truthfully in the changelog with a migration page, regardless of whether the commit is marked breaking.

Versions that touch the system schema or the change codec must also pass the migration release manifest and gate:
`pnpm nx run @aiao/source:migration-release-gate` (runs on every PR CI). The gate fails when a migration version lacks its published bridge tag or the old-bundle isolation strategy.

## Experimental tier

The following capabilities are outside the 1.0 compatibility commitment; breaking changes only need a changelog and migration-guide note:

- `@aiao/rxdb-adapter-miniprogram` as a whole (WeChat / Douyin / Alipay logic layers; Douyin and Alipay Android not verified on real devices; no crash-recovery guarantee)
- `@aiao/rxdb-taro` as a whole (Taro 4.3 vite build plugin; only Taro 4.3.x is committed to; the `./vite` Alipay assembly covers only part of the build prerequisites)
- `@aiao/rxdb-adapter-http`'s `changeFeed` SSE change notifications (off by default)
- `@aiao/rxdb-plugin-search` full-text search on `wa-sqlite` and miniprograms (`unverified`; currently throws `SearchUnsupportedAdapterError` directly)
- `@aiao/rxdb-plugin-querycache`'s `QueryCacheEngine` direct instantiation (`@experimental`)

Everything else public enters the 1.0 freeze scope. See `requirements/versioning-policy.md` in the repository for the maintainer-viewed full list.

## References

- [Migration guide](/migration/README.md)
- [Compatibility matrix](/compatibility.md)
