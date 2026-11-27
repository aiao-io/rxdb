import { describe, expect, it } from 'vitest';

import { approveCatalog, changeInstallation, parseInstallations, resolveInstallations } from './approved-catalog';

const release = {
  id: 'catalog:editor',
  name: 'Approved Editor',
  bundleId: 'io.example.editor',
  version: '1.0.0',
  url: 'https://apps.example/releases/1.0.0/editor/',
  summary: 'Edit documents.',
  capabilities: ['window', 'filesystem:read'],
  allow: [],
  readyTimeout: 10000
};
const newer = {
  ...release,
  version: '2.0.0',
  url: 'https://apps.example/releases/2.0.0/editor/',
  capabilities: ['window']
};
const empty = { version: 1 as const, apps: [] };

async function approved(releases: readonly unknown[]) {
  const bytes = new TextEncoder().encode(JSON.stringify({ formatVersion: 1, releases }));
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
  return approveCatalog(bytes, hash);
}

describe('运营批准的静态目录', () => {
  it('内容必须匹配构建固定的摘要；空目录也是真实的可发布状态', async () => {
    expect((await approved([])).releases).toEqual([]);
    await expect(approveCatalog(new TextEncoder().encode('{}'), '0'.repeat(64))).rejects.toThrow('approval');
    await expect(approveCatalog(new Uint8Array(1024 * 1024 + 1), '0'.repeat(64))).rejects.toThrow('1 MiB');
    expect((await approved([release])).releases[0]).toEqual(release);
  });

  it('拒绝不受信任来源、未版本化入口、非法权限和重名条目，但保留其他有效条目', async () => {
    const invalid = [
      { ...release, id: 'notes' },
      { ...release, url: 'http://apps.example/releases/1.0.0/editor/' },
      { ...release, url: 'https://user:secret@apps.example/releases/1.0.0/editor/' },
      { ...release, url: 'https://apps.example/latest' },
      { ...release, url: 'https://apps.example/releases/1.0.0/editor/?redirect=latest' },
      { ...release, capabilities: ['arbitrary-host-command'] },
      { ...release, allow: ['clipboard-read'], capabilities: [] },
      { ...release, name: '../outside' },
      { ...release, version: 'latest' },
      { ...release, readyTimeout: 0 }
    ];
    const report = await approved([newer, ...invalid]);
    expect(report.releases).toEqual([newer]);
    expect(report.problems).toHaveLength(invalid.length);
    const duplicates = await approved([release, release, newer]);
    expect(duplicates.releases).toEqual([newer]);
    expect(duplicates.problems.join()).toContain('Duplicate');
  });

  it('同一应用不能漂移包身份，不同应用不能占用同一包名', async () => {
    const catalog = await approved([
      release,
      { ...newer, bundleId: 'io.example.changed' },
      { ...newer, id: 'catalog:other' }
    ]);
    expect(catalog.problems.length).toBeGreaterThan(0);
  });

  it('损坏的整体结构拒绝，不作为空目录覆盖安装状态', async () => {
    const bytes = new TextEncoder().encode('{"formatVersion":2,"releases":[]}');
    const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
      .map(byte => byte.toString(16).padStart(2, '0'))
      .join('');
    await expect(approveCatalog(bytes, hash)).rejects.toThrow('format');
  });
});

describe('安装、更新、回退和卸载的持久状态', () => {
  it('安装后只存应用身份和版本，更新记住上一版本，回退恢复原权限', async () => {
    const catalog = await approved([release, newer]);
    const installed = changeInstallation(empty, catalog.releases, 'catalog:editor', '1.0.0');
    expect(installed).toEqual({ version: 1, apps: [{ id: 'catalog:editor', version: '1.0.0', previous: null }] });
    const updated = changeInstallation(installed, catalog.releases, 'catalog:editor', '2.0.0');
    expect(updated.apps[0].previous).toBe('1.0.0');
    const rolledBack = changeInstallation(updated, catalog.releases, 'catalog:editor', updated.apps[0].previous);
    expect(resolveInstallations(rolledBack, catalog.releases)[0].capabilities).toEqual(['window', 'filesystem:read']);
    expect(changeInstallation(rolledBack, catalog.releases, 'catalog:editor', null)).toEqual(empty);
  });

  it('未批准的版本不安装，已有状态不可静默修复或授予数据库里的权限', async () => {
    const catalog = await approved([release]);
    expect(() => changeInstallation(empty, catalog.releases, 'catalog:editor', '9.0.0')).toThrow('approved');
    expect(parseInstallations(undefined)).toEqual(empty);
    for (const raw of [
      null,
      {},
      { version: 2, apps: [] },
      { version: 1, apps: [release] },
      { version: 1, apps: [{ id: 'notes', version: '1.0.0', previous: null }] }
    ])
      expect(() => parseInstallations(raw)).toThrow('installation');
    const state = changeInstallation(empty, catalog.releases, 'catalog:editor', '1.0.0');
    expect(parseInstallations(state)).toEqual(state);
    expect(() => parseInstallations({ version: 1, apps: [...state.apps, ...state.apps] })).toThrow('installation');
    expect(() => resolveInstallations(state, [])).toThrow('approved');
    expect(changeInstallation(state, catalog.releases, 'catalog:editor', '1.0.0')).toEqual(state);
  });
});
