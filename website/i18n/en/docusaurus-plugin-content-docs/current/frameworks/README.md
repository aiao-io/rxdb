# Framework integration

Angular, React, and Vue share the same entity, query, and write semantics. Framework bindings adapt the reactive data flow to the UI model that each framework already uses.

| Framework | Binding style | Package |
| --- | --- | --- |
| [React](/frameworks/react.md) | Context and Hooks | `@aiao/rxdb-react` |
| [Vue](/frameworks/vue.md) | provide/inject and Composables | `@aiao/rxdb-vue` |
| [Angular](/frameworks/angular.md) | services, Signals, and directives | `@aiao/rxdb-angular` |

Use the binding package for lifecycle and rendering integration. Keep models, query rules, and persistence decisions in the framework-independent packages.
