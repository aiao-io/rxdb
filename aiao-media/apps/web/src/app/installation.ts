import type { InstallationStatus } from '@aiao-media/api-contracts';
import { apiEndpoint } from '../platform/local-backend';
import { validateSupabaseAuthConfig } from './supabase-auth-config';

const configKey = 'aiao-media.installation.auth';
function restoreConfiguration() {
  try {
    const cached = localStorage.getItem(configKey);
    if (cached) applyConfiguration(JSON.parse(cached));
  } catch {
    return;
  }
}
function applyConfiguration(value: unknown) {
  const config = validateSupabaseAuthConfig(value);
  const scope = globalThis as typeof globalThis & { __AIAO_SUPABASE_CONFIG__?: unknown };
  scope.__AIAO_SUPABASE_CONFIG__ = config;
  return config;
}
/** 在线读取安装配置，离线启动继续使用已安装的本机应用。 */
export async function prepareInstallation(navigate = (path: string) => location.replace(path)): Promise<boolean> {
  let response: Response;
  try {
    response = await fetch(apiEndpoint('/api/installation'), {
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'error',
      signal: AbortSignal.timeout(5000)
    });
  } catch {
    restoreConfiguration();
    return true;
  }
  if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) return true;
  const state = (await response.json()) as InstallationStatus;
  if (!state.initialized) {
    navigate('/admin/');
    return false;
  }
  if (state.auth) {
    const config = applyConfiguration(state.auth);
    try {
      localStorage.setItem(configKey, JSON.stringify(config));
    } catch {
      return true;
    }
  }
  return true;
}
