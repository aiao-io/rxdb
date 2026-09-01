import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const sourceRoot = resolve(import.meta.dirname);
const headerSource = readFileSync(resolve(sourceRoot, 'components/header.component.ts'), 'utf8');
const opfsSource = readFileSync(resolve(sourceRoot, 'pages/opfs.page.ts'), 'utf8');
const eventListSource = readFileSync(resolve(sourceRoot, 'components/event-list.component.ts'), 'utf8');

describe('DevTools component boundaries', () => {
  it.each(['app-branch-selector', 'app-header-nav'])('delegates header behavior to %s', selector => {
    expect(headerSource).toContain(`<${selector}`);
  });

  it.each([
    'app-opfs-toolbar',
    'app-opfs-breadcrumb',
    'app-opfs-file-table',
    'app-opfs-file-grid',
    'app-opfs-dialogs',
    'app-opfs-context-menu'
  ])('delegates OPFS behavior to %s', selector => {
    expect(opfsSource).toContain(`<${selector}`);
  });

  it('keeps handwritten icon paths out of page coordinators', () => {
    expect(headerSource).not.toContain('<path');
    expect(opfsSource).not.toContain('<path');
  });

  it('virtualizes the bounded event stream', () => {
    expect(eventListSource).toContain('cdk-virtual-scroll-viewport');
    expect(eventListSource).toContain('*cdkVirtualFor');
  });
});
