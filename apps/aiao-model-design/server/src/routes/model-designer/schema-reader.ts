/**
 * 远程 schema 读取（information_schema / 注入快照）
 */

export interface RemoteSqlColumn {
  name: string;
  type: string;
  nullable: boolean;
  primaryKey?: boolean;
  unique?: boolean;
  defaultValue?: string | null;
  check?: string | null;
}

export interface RemoteSqlForeignKey {
  name: string;
  column: string;
  refTable: string;
  refColumn: string;
  onDelete?: string | null;
  onUpdate?: string | null;
}

export interface RemoteSqlIndex {
  name: string;
  columns: string[];
  unique: boolean;
}

export interface RemoteSqlTable {
  name: string;
  columns: RemoteSqlColumn[];
  foreignKeys: RemoteSqlForeignKey[];
  indexes: RemoteSqlIndex[];
}

export interface RemoteSqlSchema {
  tables: RemoteSqlTable[];
}

export type SchemaReader = () => Promise<RemoteSqlSchema>;

/**
 * 固定快照 reader（单测 / 无 DB）
 */
export function createSnapshotSchemaReader(schema: RemoteSqlSchema): SchemaReader {
  return async () => schema;
}

/**
 * 从 DATABASE_URL 读 public schema 的表 / 列 / PK / unique / FK / index（MVP）
 */
export function createPgSchemaReader(databaseUrl: string | undefined): SchemaReader | null {
  if (!databaseUrl?.trim()) return null;

  return async () => {
    const { default: postgres } = await import('postgres');
    const sql = postgres(databaseUrl, { prepare: false, max: 1 });
    try {
      const tables = await sql<{ table_name: string }[]>`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
        ORDER BY table_name
      `;

      const columns = await sql<
        {
          table_name: string;
          column_name: string;
          data_type: string;
          udt_name: string;
          is_nullable: string;
          column_default: string | null;
        }[]
      >`
        SELECT table_name, column_name, data_type, udt_name, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_schema = 'public'
        ORDER BY table_name, ordinal_position
      `;

      const pkRows = await sql<{ table_name: string; column_name: string }[]>`
        SELECT tc.table_name, kcu.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
         AND tc.table_schema = kcu.table_schema
        WHERE tc.table_schema = 'public' AND tc.constraint_type = 'PRIMARY KEY'
      `;

      const uniqueRows = await sql<{ table_name: string; column_name: string }[]>`
        SELECT tc.table_name, kcu.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
         AND tc.table_schema = kcu.table_schema
        WHERE tc.table_schema = 'public' AND tc.constraint_type = 'UNIQUE'
      `;

      const fkRows = await sql<
        {
          constraint_name: string;
          table_name: string;
          column_name: string;
          foreign_table_name: string;
          foreign_column_name: string;
          delete_rule: string | null;
          update_rule: string | null;
        }[]
      >`
        SELECT
          tc.constraint_name,
          kcu.table_name,
          kcu.column_name,
          ccu.table_name AS foreign_table_name,
          ccu.column_name AS foreign_column_name,
          rc.delete_rule,
          rc.update_rule
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
         AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage ccu
          ON ccu.constraint_name = tc.constraint_name
         AND ccu.table_schema = tc.table_schema
        JOIN information_schema.referential_constraints rc
          ON rc.constraint_name = tc.constraint_name
         AND rc.constraint_schema = tc.table_schema
        WHERE tc.table_schema = 'public' AND tc.constraint_type = 'FOREIGN KEY'
      `;

      const indexRows = await sql<{ tablename: string; indexname: string; indexdef: string }[]>`
        SELECT tablename, indexname, indexdef
        FROM pg_indexes
        WHERE schemaname = 'public'
      `;

      const pkSet = new Set(pkRows.map(r => `${r.table_name}.${r.column_name}`));
      const uniqueSet = new Set(uniqueRows.map(r => `${r.table_name}.${r.column_name}`));

      const colsByTable = new Map<string, RemoteSqlColumn[]>();
      for (const col of columns) {
        const list = colsByTable.get(col.table_name) ?? [];
        const key = `${col.table_name}.${col.column_name}`;
        list.push({
          name: col.column_name,
          type: mapPgType(col.data_type, col.udt_name),
          nullable: col.is_nullable === 'YES',
          primaryKey: pkSet.has(key),
          unique: uniqueSet.has(key) && !pkSet.has(key),
          defaultValue: col.column_default
        });
        colsByTable.set(col.table_name, list);
      }

      const fksByTable = new Map<string, RemoteSqlForeignKey[]>();
      for (const fk of fkRows) {
        const list = fksByTable.get(fk.table_name) ?? [];
        list.push({
          name: fk.constraint_name,
          column: fk.column_name,
          refTable: fk.foreign_table_name,
          refColumn: fk.foreign_column_name,
          onDelete: normalizeAction(fk.delete_rule),
          onUpdate: normalizeAction(fk.update_rule)
        });
        fksByTable.set(fk.table_name, list);
      }

      const idxByTable = new Map<string, RemoteSqlIndex[]>();
      for (const idx of indexRows) {
        if (idx.indexname.endsWith('_pkey')) continue;
        const cols = parseIndexColumns(idx.indexdef);
        if (cols.length === 0) continue;
        const list = idxByTable.get(idx.tablename) ?? [];
        list.push({
          name: idx.indexname,
          columns: cols,
          unique: /\bUNIQUE\b/i.test(idx.indexdef)
        });
        idxByTable.set(idx.tablename, list);
      }

      return {
        tables: tables.map(t => ({
          name: t.table_name,
          columns: colsByTable.get(t.table_name) ?? [],
          foreignKeys: fksByTable.get(t.table_name) ?? [],
          indexes: idxByTable.get(t.table_name) ?? []
        }))
      };
    } finally {
      await sql.end({ timeout: 1 });
    }
  };
}

function mapPgType(dataType: string, udtName: string): string {
  const udt = udtName.toLowerCase();
  if (udt === 'int4') return 'integer';
  if (udt === 'int8') return 'bigint';
  if (udt === 'float8') return 'double precision';
  if (udt === 'bool') return 'boolean';
  if (udt === 'uuid') return 'uuid';
  if (udt === 'jsonb') return 'jsonb';
  if (udt === 'timestamptz') return 'timestamptz';
  if (udt === 'text') return 'text';
  if (dataType === 'ARRAY') return `${udt.replace(/^_/, '')}[]`;
  return dataType.toLowerCase() === 'timestamp with time zone' ? 'timestamptz' : dataType.toLowerCase();
}

function normalizeAction(rule: string | null): string | null {
  if (!rule) return null;
  const upper = rule.toUpperCase().replaceAll(' ', ' ');
  if (upper === 'NO ACTION') return null;
  return upper;
}

/** 从 CREATE INDEX ... ON t (a, b) 粗解析列名 */
export function parseIndexColumns(indexdef: string): string[] {
  const m = indexdef.match(/\((.+)\)\s*$/);
  if (!m) return [];
  return m[1]
    .split(',')
    .map(part => part.trim().replaceAll('"', '').split(' ')[0])
    .filter(Boolean);
}
