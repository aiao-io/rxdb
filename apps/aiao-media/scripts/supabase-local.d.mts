export interface LocalSupabaseEnvironment {
  env: Record<string, string>;
  url: string;
  mailUrl: string;
  publicEnv: {
    AIAO_SUPABASE_URL: string;
    AIAO_SUPABASE_ANON_KEY: string;
  };
}
export function localEnvironment(): Promise<LocalSupabaseEnvironment>;
