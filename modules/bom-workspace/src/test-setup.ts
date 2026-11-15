import { setupTestBed } from '@analogjs/vitest-angular/setup-testbed';
import '@angular/compiler';
import { TestBed } from '@angular/core/testing';
import { BOM_WORKSPACE_CONFIG } from './config';

setupTestBed();

import { beforeEach } from 'vitest';
beforeEach(() => {
  TestBed.configureTestingModule({
    providers: [
      {
        provide: BOM_WORKSPACE_CONFIG,
        useValue: {
          databaseName: 'bom-workspace-test',
          overviewPath: '/',
          workbenchPath: null,
          label: 'BOM 演示中心'
        }
      }
    ]
  });
  const values = new Map<string, string>();
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
      clear: () => values.clear(),
      key: (index: number) => [...values.keys()][index] ?? null,
      get length() {
        return values.size;
      }
    }
  });
});
