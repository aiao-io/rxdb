const API_VARIABLES = [
  'DATABASE_URL', 'MODEL_DESIGNER_BACKEND_ADAPTER', 'MODEL_DESIGNER_BACKEND_TOKEN',
  'DEEPSEEK_API_KEY', 'DEEPSEEK_BASE_URL',
  'GATEWAY_ASR_BASE_URL', 'GATEWAY_ASR_API_KEY', 'GATEWAY_TTS_BASE_URL', 'GATEWAY_TTS_API_KEY',
  'SUPABASE_JWT_ISSUER_URL', 'SUPABASE_JWT_ISSUER', 'SUPABASE_JWT_AUDIENCE', 'SUPABASE_JWT_SECRET',
  'MODEL_CLIENT_REGISTRY_URL', 'NPM_TOKEN', 'CORS_ORIGIN'
] as const;

type ContainerSecrets = Partial<Record<(typeof API_VARIABLES)[number] | 'SUPABASE_URL', string>>;

/** 将 Worker secrets 显式映射到 Bun，JWT 地址从同一 Supabase 项目派生。 */
export function containerEnvironment(env: ContainerSecrets): Record<string, string> {
  const result: Record<string, string> = { NODE_ENV: 'production', PORT: '3200', SUPABASE_JWT_AUDIENCE: 'authenticated' };
  if (env.SUPABASE_URL) {
    const issuer = `${env.SUPABASE_URL.replace(/\/$/, '')}/auth/v1`;
    result['SUPABASE_JWT_ISSUER'] = issuer;
    result['SUPABASE_JWT_ISSUER_URL'] = `${issuer}/.well-known/jwks.json`;
  }
  for (const name of API_VARIABLES) {
    const value = env[name]?.trim();
    if (value) result[name] = value;
  }
  return result;
}
