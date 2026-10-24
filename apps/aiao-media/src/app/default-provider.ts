import type { LocalProvider } from './local-provider';

/**
 * The local-first app needs one usable provider entry before a user has saved
 * any settings.  This entry contains no credential; the key is still entered
 * by the user for the current session when generation starts.
 */
export const DEFAULT_FREE_PROVIDER_ID = '00000000-0000-4000-8000-000000000001';

export const DEFAULT_FREE_PROVIDER: LocalProvider = {
  id: DEFAULT_FREE_PROVIDER_ID,
  name: '默认免费供应商',
  baseUrl: 'https://api.pengdevs.com',
  model: 'gpt-image-2.5',
  // The default provider rejects browser CORS preflight. Use the same-origin
  // relay so generation does not depend on provider CORS support.
  mode: 'proxy',
  rememberKey: false
};

export function defaultFreeProvider(): LocalProvider {
  return { ...DEFAULT_FREE_PROVIDER };
}
