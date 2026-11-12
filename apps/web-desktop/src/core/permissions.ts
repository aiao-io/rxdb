import { requireCondition } from './errors.js';
import type { DesktopState, Grant, Identity } from './types.js';

export function checkPermission(state: DesktopState, identity: Identity, capability: string, scope: string): boolean {
  if (!identity.capabilities.includes(capability)) return false;
  return state.grants.some(
    grant =>
      grant.appId === identity.appId &&
      grant.origin === identity.origin &&
      grant.capability === capability &&
      (grant.scope === '*' || grant.scope === scope) &&
      (grant.instanceId === null || grant.instanceId === identity.instanceId)
  );
}

export function grantPermission(
  state: DesktopState,
  identity: Identity,
  capability: string,
  scope: string,
  persistent: boolean
): Grant {
  requireCondition(identity.capabilities.includes(capability), 'DENIED', '应用未声明此能力');
  const grant = {
    id: crypto.randomUUID(),
    appId: identity.appId,
    origin: identity.origin,
    capability,
    scope,
    instanceId: persistent ? null : identity.instanceId
  };
  state.grants.push(grant);
  return grant;
}

export function revokePermission(state: DesktopState, id: string): void {
  state.grants = state.grants.filter(grant => grant.id !== id);
}
