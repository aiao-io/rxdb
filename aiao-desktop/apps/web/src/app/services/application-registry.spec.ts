import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';

import { ApprovedRelease } from '../data/approved-catalog';
import { configureServices } from '../testing/angular';
import { testApps } from '../testing/desktop-apps';
import { ApplicationRegistry } from './application-registry';
import { DESKTOP_APPS } from './desktop-apps';

vi.mock('../apps/web-app/web-app', () => ({ WebAppWindow: class WebAppWindow {} }));

const release: ApprovedRelease = {
  id: 'catalog:editor',
  name: 'Approved Editor',
  bundleId: 'io.example.editor',
  version: '1.0.0',
  url: 'https://apps.example/releases/1.0.0/editor/',
  summary: 'Edit documents.',
  capabilities: ['window'],
  allow: [],
  readyTimeout: 10000
};

describe('统一应用登记表', () => {
  it('预装定义不变，批准安装增加所有入口，移除后不再解析', () => {
    const base = testApps();
    configureServices([ApplicationRegistry, { provide: DESKTOP_APPS, useValue: base }]);
    const registry = TestBed.inject(ApplicationRegistry);
    expect(registry.apps()).toBe(base);
    registry.replace([release]);
    expect(registry.apps()['catalog:editor']).toMatchObject({
      kind: 'web',
      installScope: 'approved-catalog',
      web: { version: '1.0.0' }
    });
    expect(registry.launchOrder()).toContain('catalog:editor');
    expect(registry.apps().notes).toBe(base.notes);
    registry.replace([]);
    expect(registry.apps()['catalog:editor']).toBeUndefined();
    expect(registry.launchOrder()).not.toContain('catalog:editor');
  });

  it('名称或包标识冲突不取代预装应用，也不发布半张登记表', () => {
    const base = testApps();
    configureServices([ApplicationRegistry, { provide: DESKTOP_APPS, useValue: base }]);
    const registry = TestBed.inject(ApplicationRegistry);
    expect(() => registry.replace([{ ...release, name: base.notes.name }])).toThrow('conflict');
    expect(registry.apps()).toBe(base);
  });
});

it('可选应用按需装载远程窗口；未改变的清单不触发运行窗口重建', async () => {
  configureServices([ApplicationRegistry, { provide: DESKTOP_APPS, useValue: testApps() }]);
  const registry = TestBed.inject(ApplicationRegistry);
  registry.replace([release]);
  const installed = registry.apps();
  registry.replace([{ ...release }]);
  expect(registry.apps()).toBe(installed);
  const definition = registry.apps()[release.id];
  if (definition.kind !== 'web' || !definition.load) throw new Error('expected a web app');
  expect((await definition.load()).name).toBe('WebAppWindow');
});
