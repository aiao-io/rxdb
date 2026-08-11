const REMOTE_SYSTEM_NAMESPACE = 'rxdb';
const REMOTE_SYSTEM_SCHEMA = 'public';

export const resolve_supabase_schema = (namespace?: string) => {
  if (!namespace) return namespace;
  return namespace === REMOTE_SYSTEM_NAMESPACE ? REMOTE_SYSTEM_SCHEMA : namespace;
};
