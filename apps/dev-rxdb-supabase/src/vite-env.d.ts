/// <reference types="vite/client" />

/**
 * 这些字段只在 Vite dev server 下有值。生产构建把 `import.meta.env` 定死成不含
 * `VITE_*` 的常量（`project.json` 的 `build.configurations.production.define`），
 * 全部读到 `undefined` —— 各调用点都按「缺省即本地」处理，不要新增依赖它们有值的代码。
 */
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_KEY?: string;
  readonly VITE_RXDB_DB_NAME?: string;
  readonly VITE_RXDB_USER_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
