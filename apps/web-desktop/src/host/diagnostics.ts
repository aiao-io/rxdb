export interface DiagnosticEntry {
  time: string;
  appId: string;
  version: string;
  instanceId: string;
  category: string;
}
export const HOST_VERSION = '1.0.0';
export const ORBIT_VERSION = '0.0.1';
export const UPSTREAM = 'c45932998c0602f34454df8d3e29f4d33a38446a';

export function diagnostics(entries: DiagnosticEntry[], apps: { appId: string; version: string }[]): object {
  return {
    hostVersion: HOST_VERSION,
    orbitVersion: ORBIT_VERSION,
    upstream: UPSTREAM,
    browser: navigator.userAgent,
    apps: apps.map(({ appId, version }) => ({ appId, version })),
    errors: entries.map(({ time, appId, version, instanceId, category }) => ({
      time,
      appId,
      version,
      instanceId,
      category
    }))
  };
}
