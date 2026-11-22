# Plugin authoring

RxDB plugins extend a stable core boundary with optional capabilities such as history, search, sync, boards, and file management.

## Keep the boundary explicit

A plugin should expose its public types from a stable entry point, keep framework bindings in separate Angular, React, and Vue packages, and avoid making the core package depend on a UI framework.

## Recommended workflow

1. Define the framework-independent capability and its public contracts.
2. Add the Angular, React, and Vue bindings with equivalent names and behavior when the capability has a UI surface.
3. Add tests for the core package and all framework bindings.
4. Document installation, lifecycle, errors, and persistence behavior.
5. Run the affected Nx targets before opening a pull request.

See the package-specific plugin guides and the repository [contribution guide](https://github.com/aiao-io/rxdb/blob/main/CONTRIBUTING.md) for workspace conventions.
