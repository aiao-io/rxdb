import { describe, expect, it } from 'vitest';
import { containerEnvironment } from './container-env';

describe('容器运行环境', () => {
  it('从同一 Supabase 项目生成 JWT issuer 和 JWKS 地址', () => {
    expect(containerEnvironment({ SUPABASE_URL: 'https://project.supabase.co/' })).toMatchObject({
      NODE_ENV: 'production', PORT: '3200',
      SUPABASE_JWT_ISSUER: 'https://project.supabase.co/auth/v1',
      SUPABASE_JWT_ISSUER_URL: 'https://project.supabase.co/auth/v1/.well-known/jwks.json',
      SUPABASE_JWT_AUDIENCE: 'authenticated'
    });
  });
  it('只把明确列出的运行变量交给容器', () => {
    const env = { DEEPSEEK_API_KEY: 'deepseek-secret', DATABASE_URL: 'postgres://db', SUPABASE_ANON_KEY: 'anon', CLOUDFLARE_API_TOKEN: 'cloud-secret' };
    const result = containerEnvironment(env);
    expect(result['DEEPSEEK_API_KEY']).toBe('deepseek-secret');
    expect(result['DATABASE_URL']).toBe('postgres://db');
    expect(result).not.toHaveProperty('CLOUDFLARE_API_TOKEN');
    expect(result).not.toHaveProperty('SUPABASE_ANON_KEY');
  });
  it('显式 JWT 配置优先于派生值', () => {
    expect(containerEnvironment({ SUPABASE_URL: 'https://project.supabase.co', SUPABASE_JWT_ISSUER: 'custom-issuer', SUPABASE_JWT_ISSUER_URL: 'https://custom/jwks', SUPABASE_JWT_AUDIENCE: 'custom-audience' })).toMatchObject({ SUPABASE_JWT_ISSUER: 'custom-issuer', SUPABASE_JWT_ISSUER_URL: 'https://custom/jwks', SUPABASE_JWT_AUDIENCE: 'custom-audience' });
  });
  it('没有 Supabase URL 时不构造无效的 JWKS 地址', () => {
    expect(containerEnvironment({})).not.toHaveProperty('SUPABASE_JWT_ISSUER_URL');
  });
});
