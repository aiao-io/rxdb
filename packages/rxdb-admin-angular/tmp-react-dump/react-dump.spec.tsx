import { act, fireEvent, screen } from '@testing-library/react';
import { Database, House } from 'lucide-react';
import { mkdirSync, writeFileSync } from 'node:fs';
import { describe, it } from 'vitest';
import { mount } from '../../rxdb-admin-react/src/__tests__/test-utils';
import { dump } from './normalize';

const OUT = '/tmp/dom-dump/react';
mkdirSync(OUT, { recursive: true });
const save = (name: string): void => {
  writeFileSync(`${OUT}/${name}.txt`, dump(document.body).join('\n') + '\n');
};

describe('dom dump (react)', () => {
  it('default', () => {
    mount();
    save('default');
  });
  it('header-nav', () => {
    mount({ defaults: { app: { layout: 'header-nav' } } });
    save('header-nav');
  });
  it('header-sidebar-nav', () => {
    mount({ defaults: { app: { layout: 'header-sidebar-nav' } } });
    save('header-sidebar-nav');
  });
  it('full-content', () => {
    mount({ defaults: { app: { layout: 'full-content' }, footer: { enable: true } } });
    save('full-content');
  });
  it('mobile-open', () => {
    mount({}, {}, { mobile: true });
    fireEvent.click(screen.getByTestId('admin-menu-toggle'));
    save('mobile-open');
  });
  it('collapsed', () => {
    mount({ defaults: { sidebar: { collapsed: true } } });
    save('collapsed');
  });
  it('footer', () => {
    mount({
      defaults: {
        footer: { enable: true, fixed: true },
        copyright: { companyName: '某某公司', companySiteLink: 'https://x.test', icp: '京ICP备1号', icpLink: 'https://icp.test' }
      }
    });
    save('footer');
  });
  it('watermark', () => {
    mount({ defaults: { app: { watermark: true, watermarkContent: '机密' } } });
    save('watermark');
  });
  it('navigating', () => {
    mount({ defaults: { transition: { loading: true } } }, { navigating: true });
    save('navigating');
  });
  it('maximized', () => {
    const { shell } = mount();
    act(() => shell.ui.toggleMaximize());
    save('maximized');
  });
  it('tabs', () => {
    const { shell } = mount();
    act(() => {
      shell.syncRoute('/search');
      shell.syncRoute('/entities/assets/AssetCategory');
      shell.tabs.togglePin('/search');
    });
    save('tabs');
    fireEvent.contextMenu(screen.getAllByTestId('admin-tab')[1], { clientX: 40, clientY: 40 });
    save('tabs-menu');
  });
  it('icons', () => {
    mount(
      {},
      {
        menu: [
          { id: 'entities', label: '实体', icon: <Database size={16} />, expanded: true, children: [{ id: 'asset', label: '资产', icon: <House size={16} />, route: '/entities/assets/Asset', testId: 'nav-asset' }] }
        ]
      }
    );
    save('icons');
  });
  it('drawer', () => {
    const { shell } = mount({ extensions: [{ key: 'tablePageSize', type: 'number', defaultValue: 20, min: 10, max: 100, step: 10, label: '每页行数' }] });
    act(() => shell.ui.setPreferencesOpen(true));
    for (const tab of ['appearance', 'layout', 'shortcuts', 'general', 'extension']) {
      fireEvent.click(screen.getByTestId(`pref-tab-${tab}`));
      save(`drawer-${tab}`);
    }
    fireEvent.click(screen.getByTestId('pref-import'));
    save('drawer-import');
  });
  it('palette', () => {
    const { shell } = mount();
    act(() => shell.palette.open());
    save('palette-open');
    fireEvent.change(screen.getByTestId('admin-palette-input'), { target: { value: '资产' } });
    save('palette-query');
    fireEvent.change(screen.getByTestId('admin-palette-input'), { target: { value: 'zzzzzz' } });
    save('palette-empty');
  });
  it('lock', async () => {
    const { shell } = mount();
    act(() => shell.lock.lock());
    save('lock-set');
    await act(async () => shell.lock.setPassword('x'));
    act(() => shell.lock.lock());
    save('lock-enter');
    fireEvent.click(screen.getByTestId('admin-lock-forgot'));
    save('lock-forgot');
  });
  it('widgets', () => {
    mount({ defaults: { widget: { hidden: ['lock', 'refresh'] }, app: { timezone: 'Asia/Tokyo' } } });
    save('widgets');
  });
  it('extra', () => {
    mount({}, { renderMenuExtra: node => <b data-testid={`badge-${node.id}`}>3</b> });
    save('extra');
  });
  it('breadcrumb', () => {
    mount(
      { defaults: { breadcrumb: { showHome: true, showIcon: true, styleType: 'background' } } },
      {
        menu: [
          { id: 'entities', label: '实体', icon: <Database size={16} />, expanded: true, children: [{ id: 'asset', label: '资产', icon: <House size={16} />, route: '/entities/assets/Asset', testId: 'nav-asset' }] }
        ]
      }
    );
    save('breadcrumb');
  });
  it('drawer-diff', () => {
    const { shell } = mount();
    act(() => {
      shell.preferences.setPath('theme.colorPrimary', '#ff0000');
      shell.preferences.setPath('widget.hidden', ['lock']);
      shell.preferences.setPath('app.compact', true);
      shell.ui.setPreferencesOpen(true);
    });
    save('drawer-diff-appearance');
    fireEvent.click(screen.getByTestId('pref-tab-layout'));
    save('drawer-diff-layout');
  });
  it('raw-text', () => {
    const { shell } = mount();
    act(() => shell.palette.open());
    const pick = (selector: string): string => JSON.stringify(document.querySelector(selector)?.textContent);
    writeFileSync(`${OUT}/raw-text.txt`, [pick('.admin-palette-footer'), pick('[data-testid="admin-widget-search"]'), pick('.admin-palette-item')].join('\n') + '\n');
  });
  it('semi-dark', () => {
    mount({ defaults: { theme: { name: 'light', semiDarkSidebar: true, semiDarkHeader: true } } });
    save('semi-dark');
  });
  it('rail-title', () => {
    mount({ defaults: { sidebar: { collapsed: true, collapsedShowTitle: true } } });
    save('rail-title');
  });
  it('resizer-dragging', () => {
    mount();
    fireEvent.pointerDown(screen.getByTestId('admin-sidebar-resizer'), { clientX: 240, pointerId: 1 });
    save('resizer-dragging');
  });
});
