import type { DesktopCapability } from '@aiao/orbit/desktop';

import {
  APP_CAPABILITIES,
  CatalogAppId,
  DesktopAppManifests,
  WEB_APP_PERMISSIONS,
  WebAppManifest,
  WebAppPermission,
  validateManifests
} from '../services/desktop-apps';

export interface ApprovedRelease {
  readonly id: CatalogAppId;
  readonly name: string;
  readonly bundleId: string;
  readonly version: string;
  readonly url: string;
  readonly summary: string;
  readonly capabilities: readonly DesktopCapability[];
  readonly allow: readonly WebAppPermission[];
  readonly readyTimeout: number;
}

export interface ApprovedCatalog {
  readonly releases: readonly ApprovedRelease[];
  readonly problems: readonly string[];
}

export interface InstalledApp {
  readonly id: CatalogAppId;
  readonly version: string;
  readonly previous: string | null;
}

export interface Installations {
  readonly version: 1;
  readonly apps: readonly InstalledApp[];
}

const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid catalog or installation record.');
  return value as Record<string, unknown>;
};
const isId = (value: unknown): value is CatalogAppId =>
  typeof value === 'string' && /^catalog:[a-z][a-z0-9-]{0,63}$/.test(value);
const isVersion = (value: unknown): value is string =>
  typeof value === 'string' && /^(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})$/.test(value);
const text = (value: unknown, maximum: number): value is string =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= maximum;
const list = <T extends string>(value: unknown, allowed: readonly T[]): value is T[] =>
  Array.isArray(value) &&
  value.every(item => typeof item === 'string' && allowed.includes(item as T)) &&
  new Set(value).size === value.length;

export function catalogManifest(release: ApprovedRelease): WebAppManifest {
  return {
    id: release.id,
    name: release.name,
    bundleId: release.bundleId,
    icon: 'app-safari',
    kind: 'web',
    installScope: 'approved-catalog',
    showInApplications: true,
    defaultPinned: false,
    dockRemovable: true,
    w: 1000,
    h: 680,
    minW: 500,
    minH: 320,
    restore: 'deferred',
    capabilities: release.capabilities,
    web: { url: release.url, version: release.version, allow: release.allow, readyTimeout: release.readyTimeout }
  };
}

function releaseOf(value: unknown): ApprovedRelease {
  const raw = object(value);
  if (
    !isId(raw['id']) ||
    !isVersion(raw['version']) ||
    !text(raw['name'], 80) ||
    !text(raw['summary'], 500) ||
    !text(raw['bundleId'], 128) ||
    !text(raw['url'], 2048)
  )
    throw new Error('Invalid release identity or description.');
  if (/[/\\]/.test(raw['name']) || [...raw['name']].some(char => char.charCodeAt(0) < 32))
    throw new Error('Invalid application name.');
  if (
    !list(raw['capabilities'], APP_CAPABILITIES) ||
    !list(raw['allow'], WEB_APP_PERMISSIONS) ||
    typeof raw['readyTimeout'] !== 'number'
  )
    throw new Error('Invalid release capabilities.');
  const url = new URL(raw['url']);
  if (url.search || url.hash || !url.pathname.includes(`/releases/${raw['version']}/`))
    throw new Error('An immutable versioned release URL is required.');
  const release: ApprovedRelease = {
    id: raw['id'],
    version: raw['version'],
    name: raw['name'],
    summary: raw['summary'],
    bundleId: raw['bundleId'],
    url: raw['url'],
    capabilities: raw['capabilities'],
    allow: raw['allow'],
    readyTimeout: raw['readyTimeout']
  };
  const problems = validateManifests({ [release.id]: catalogManifest(release) } as DesktopAppManifests);
  if (problems.length) throw new Error(problems.join(' '));
  return release;
}

/** 目录哈希由构建固定；错误条目独立拒绝，重复版本全部拒绝，不依赖条目顺序。 */
export async function approveCatalog(bytes: Uint8Array, expected: string): Promise<ApprovedCatalog> {
  if (bytes.byteLength > 1024 * 1024) throw new Error('The approved catalog is limited to 1 MiB.');
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes.slice()))]
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
  if (hash !== expected) throw new Error('The application catalog does not match operator approval.');
  const raw = object(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)));
  if (raw['formatVersion'] !== 1 || !Array.isArray(raw['releases']) || raw['releases'].length > 128)
    throw new Error('Unsupported application catalog format.');
  const problems: string[] = [];
  const candidates: ApprovedRelease[] = [];
  for (const [index, value] of raw['releases'].entries()) {
    try {
      candidates.push(releaseOf(value));
    } catch (error) {
      problems.push(`Release ${index + 1}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  const releases = candidates.filter(release => {
    const duplicate =
      candidates.filter(other => other.id === release.id && other.version === release.version).length > 1;
    const drift = candidates.some(
      other =>
        (other.id === release.id && other.bundleId !== release.bundleId) ||
        (other.id !== release.id && (other.bundleId === release.bundleId || other.name === release.name))
    );
    if (duplicate || drift)
      problems.push(`Duplicate or conflicting release identity: ${release.id}@${release.version}`);
    return !duplicate && !drift;
  });
  return { releases, problems };
}

export function parseInstallations(value: unknown): Installations {
  if (value === undefined) return { version: 1, apps: [] };
  const raw = object(value);
  if (raw['version'] !== 1 || !Array.isArray(raw['apps']) || raw['apps'].length > 128)
    throw new Error('Invalid application installation state.');
  const apps = raw['apps'].map(value => {
    const app = object(value);
    if (
      !isId(app['id']) ||
      !isVersion(app['version']) ||
      (app['previous'] !== null && !isVersion(app['previous'])) ||
      Object.keys(app).some(key => !['id', 'version', 'previous'].includes(key))
    )
      throw new Error('Invalid application installation record.');
    return { id: app['id'], version: app['version'], previous: app['previous'] as string | null };
  });
  if (new Set(apps.map(app => app.id)).size !== apps.length)
    throw new Error('Duplicate application installation records.');
  return { version: 1, apps };
}

export function resolveInstallations(state: Installations, releases: readonly ApprovedRelease[]): ApprovedRelease[] {
  return state.apps.map(app => {
    const release = releases.find(release => release.id === app.id && release.version === app.version);
    if (!release) throw new Error(`Installed release is no longer approved: ${app.id}@${app.version}`);
    return release;
  });
}

export function changeInstallation(
  state: Installations,
  releases: readonly ApprovedRelease[],
  id: CatalogAppId,
  version: string | null
): Installations {
  const current = state.apps.find(app => app.id === id);
  if (version === current?.version) return state;
  const apps = state.apps.filter(app => app.id !== id);
  if (version === null) return { version: 1, apps };
  if (!releases.some(release => release.id === id && release.version === version))
    throw new Error('The requested release is not approved.');
  return { version: 1, apps: [...apps, { id, version, previous: current?.version ?? null }] };
}
