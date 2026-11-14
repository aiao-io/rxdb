const angularPackage = {
  name: 'browser-angular-project',
  private: true,
  version: '0.0.0',
  type: 'module',
  scripts: { start: 'ng serve', build: 'ng build' },
  dependencies: {
    '@angular/common': '22.2.3',
    '@angular/compiler': '22.2.3',
    '@angular/core': '22.2.3',
    '@angular/platform-browser': '22.2.3',
    rxjs: '7.8.2',
    tslib: '2.8.1'
  },
  devDependencies: {
    '@angular/build': '22.2.4',
    '@angular/cli': '22.2.4',
    '@angular/compiler-cli': '22.2.3',
    typescript: '6.0.3'
  }
};

/** 受控 Angular 模板与普通 Angular CLI 导出配置使用同一份源码。 */
export const angularTemplate = {
  template: 'angular' as const,
  entry: 'src/main.ts',
  files: {
    'pnpm-lock.yaml': templateLocks.angular,
    'index.html':
      '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Angular workspace</title><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><app-root></app-root></body></html>',
    'src/main.ts': `import '@angular/compiler';
import { bootstrapApplication } from '@angular/platform-browser';
import { App } from './app';

bootstrapApplication(App).catch(error => {
  console.error(error);
  throw error;
});
`,
    'src/app.ts': `import { Component, inject } from '@angular/core';
import { Counter, CounterState } from './counter';

@Component({
  selector: 'app-root',
  templateUrl: './app.html',
  imports: [Counter]
})
export class App {
  readonly state = inject(CounterState);
}
`,
    'src/app.html':
      '<h1>Angular workspace</h1><p data-testid="parent-count">Parent: {{ state.count() }}</p><app-counter />\n',
    'src/counter.ts': `import { Component, Service, inject, signal } from '@angular/core';

@Service()
export class CounterState {
  readonly count = signal(0);
  increment(): void {
    this.count.update(value => value + 1);
  }
}

@Component({
  selector: 'app-counter',
  template: '<button type="button" (click)="state.increment()">Count: {{ state.count() }}</button>',
  styles: ['button { color: rgb(12, 80, 120); }']
})
export class Counter {
  readonly state = inject(CounterState);
}
`,
    'package.json': JSON.stringify(angularPackage, null, 2),
    'angular.json': JSON.stringify(
      {
        version: 1,
        projects: {
          app: {
            projectType: 'application',
            root: '',
            sourceRoot: 'src',
            architect: {
              build: {
                builder: '@angular/build:application',
                options: {
                  browser: 'src/main.ts',
                  index: 'index.html',
                  tsConfig: 'tsconfig.json',
                  outputPath: 'dist'
                }
              },
              serve: {
                builder: '@angular/build:dev-server',
                options: { buildTarget: 'app:build' }
              }
            }
          }
        }
      },
      null,
      2
    ),
    'tsconfig.json': JSON.stringify(
      {
        compilerOptions: {
          target: 'ES2022',
          module: 'ESNext',
          moduleResolution: 'bundler',
          strict: true,
          experimentalDecorators: true,
          useDefineForClassFields: true,
          skipLibCheck: true,
          lib: ['ES2022', 'DOM']
        },
        angularCompilerOptions: { strictTemplates: true },
        files: ['src/main.ts']
      },
      null,
      2
    )
  }
};

import { templateLocks } from './template-locks.js';
