/**
 * 迁移幂等验收（ADMIN-US-217 AC#1），Nx 目标 `rxdb-admin-template:migration-check`：在**干净的**本地预演栈上连续执行两次产品迁移，
 * 断言第二次不报错、不产生任何变更。
 *
 * 1. 前提：库里还没有 `admin_private` schema（干净的 Supabase 项目）；否则提示先 `local-down -- --volumes` 再 `local-up`；
 * 2. 第一次迁移（与发布流水线第 1 步同一个命令 `admin-collaboration:migrate`，迁移所有者连接）；
 * 3. 导出结构 A：`pg_dump --schema-only` 整库（含 RLS 策略、授权、函数、Realtime publication；去掉 Realtime 按天建的消息分区，
 *    它们由 Realtime 的定时任务增删，与迁移无关），以及只含产品对象的导出（`public`、`admin_private` 与 `realtime.messages`
 *    上的策略），另查目录得到 RLS 开关、策略、授权、publication 成员与专用角色属性；
 * 4. 写入一份数据（初始化一个工作区，与流水线第 4 步相同），记下产品各表的行数与内容摘要；
 * 5. 第二次迁移；导出结构 B 与数据摘要；
 * 6. 断言：两次导出逐字节相同、目录查询结果相同、数据摘要相同；产品表全部开着 RLS，产品表都不在 publication 里（失效通知走 Broadcast）。
 * 结果写到 `.state/acceptance/migration-check-<时刻>/`（两份导出、产品导出与 summary.json），不含任何密钥。
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';
import { loadEnv, ownerDatabaseUrl } from './lib/env.mjs';
import { deployedWorkspace, local, migrationsRoot, schemaFile, siteRoot, stackFile, stateRoot } from './lib/paths.mjs';
import { compose, nx } from './lib/process.mjs';
import { linkedRelease } from './lib/releases.mjs';
import { migrationManifest } from './lib/stack.mjs';

/** pg_dump 17.6 起每次随机生成 `\restrict` 密钥；固定它，两次导出才能逐字节比较。 */
const restrictKey = 'admintemplatemigrationcheck';
const sha256 = text => createHash('sha256').update(text).digest('hex');

/** 产品的表与视图：`admin_private` 下的全部表，`public` 下的 admin_* 与 shared_records。 */
const productRelations = `
  SELECT n.nspname AS schema, c.relname AS name, c.relkind AS kind, c.relrowsecurity AS rls
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE c.relkind IN ('r', 'v', 'p')
    AND (n.nspname = 'admin_private' OR (n.nspname = 'public' AND (c.relname LIKE 'admin\\_%' OR c.relname = 'shared_records')))
  ORDER BY 1, 2`;
/** 目录快照：策略、授权、publication 成员、专用角色属性与产品函数（定义的摘要）。 */
const catalogQueries = {
  policies: `SELECT schemaname, tablename, policyname, permissive, roles::text, cmd, qual, with_check FROM pg_policies
    WHERE schemaname IN ('admin_private', 'public') OR (schemaname = 'realtime' AND tablename = 'messages') ORDER BY 1, 2, 3`,
  grants: `SELECT table_schema, table_name, grantee, privilege_type FROM information_schema.role_table_grants
    WHERE (table_schema = 'admin_private' OR (table_schema = 'public' AND (table_name LIKE 'admin\\_%' OR table_name = 'shared_records')))
      AND grantee IN ('anon', 'authenticated', 'service_role', 'admin_collaboration', 'PUBLIC') ORDER BY 1, 2, 3, 4`,
  columnGrants: `SELECT table_schema, table_name, column_name, grantee, privilege_type FROM information_schema.column_privileges
    WHERE table_schema IN ('admin_private', 'public') AND grantee = 'admin_collaboration' ORDER BY 1, 2, 3, 4, 5`,
  publication: `SELECT pubname, schemaname, tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime' ORDER BY 2, 3`,
  role: `SELECT rolname, rolsuper, rolinherit, rolcreaterole, rolcreatedb, rolreplication, rolbypassrls FROM pg_roles
    WHERE rolname = 'admin_collaboration'`,
  functions: `SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args, p.prosecdef, md5(pg_get_functiondef(p.oid)) AS definition,
      coalesce(array_to_string(p.proacl, ','), '') AS acl
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'admin_private' OR (n.nspname = 'public' AND p.proname LIKE 'admin\\_%') ORDER BY 1, 2, 3`
};

async function catalog(owner) {
  const relations = (await owner.query(productRelations)).rows;
  const snapshot = { relations };
  for (const [name, sql] of Object.entries(catalogQueries)) snapshot[name] = (await owner.query(sql)).rows;
  return snapshot;
}
/** 产品各表的行数与内容摘要（按整行文本排序后取 md5），用来证明第二次迁移不改数据。 */
async function dataDigest(owner) {
  const tables = (await owner.query(`${productRelations}`)).rows.filter(row => row.kind !== 'v');
  const digest = {};
  for (const { schema, name } of tables) {
    const { rows } = await owner.query(
      `SELECT count(*)::int AS rows, coalesce(md5(string_agg(t::text, ',' ORDER BY t::text)), '') AS md5 FROM ${schema}.${name} t`
    );
    digest[`${schema}.${name}`] = rows[0];
  }
  return digest;
}

async function dump(secrets, release, args) {
  return compose(
    [
      'exec',
      '-T',
      'db',
      'pg_dump',
      '-U',
      'supabase_admin',
      '-d',
      'postgres',
      '--schema-only',
      `--restrict-key=${restrictKey}`,
      ...args
    ],
    { secrets, release, capture: true, quiet: true }
  );
}
/** 整库结构，去掉 Realtime 按天建的消息分区。 */
const fullDump = (secrets, release) => dump(secrets, release, ['--exclude-table=realtime.messages_2*']);
/** 只含产品对象：public 与 admin_private 两个 schema，加上 realtime.messages 上的策略（取 CREATE POLICY 语句）。 */
async function productDump(secrets, release) {
  const schemas = await dump(secrets, release, ['--schema=public', '--schema=admin_private']);
  const messages = await dump(secrets, release, ['--table=realtime.messages']);
  const policies = messages
    .split(/\n(?=--)/)
    .filter(block => /CREATE POLICY/.test(block))
    .join('\n');
  return `${schemas}\n-- realtime.messages 上的策略\n${policies}\n`;
}

async function main() {
  const secrets = await loadEnv();
  const release = (await linkedRelease(siteRoot, 'functions')) ?? 'none';
  const owner = new pg.Pool({ connectionString: ownerDatabaseUrl(secrets), max: 2 });
  const ownerEnv = { ADMIN_OWNER_DATABASE_URL: ownerDatabaseUrl(secrets) };
  try {
    const { rows } = await owner.query("SELECT 1 FROM pg_namespace WHERE nspname = 'admin_private'");
    if (rows.length)
      throw new Error(
        '库里已有 admin_private：AC#1 要在干净的栈上做。先 pnpm nx run rxdb-admin-template:local-down -- --volumes，再 local-up'
      );
    const migrations = await migrationManifest();
    const stamp = new Date().toISOString().replace(/[-:.]/g, '').slice(0, 15);
    const directory = path.join(stateRoot, 'acceptance', `migration-check-${stamp}`);
    await mkdir(directory, { recursive: true });

    console.info(`第一次迁移（${migrations.length} 个文件）`);
    await nx(['run', 'admin-collaboration:migrate'], ownerEnv);
    const firstDump = await fullDump(secrets, release);
    const firstProduct = await productDump(secrets, release);
    const firstCatalog = await catalog(owner);
    console.info('写入一份数据：初始化预演工作区');
    const stack = JSON.parse(await readFile(stackFile, 'utf8'));
    await nx(['run', 'admin-collaboration:bootstrap'], {
      ...ownerEnv,
      SUPABASE_URL: local.supabaseUrl,
      SUPABASE_SERVICE_ROLE_KEY: secrets.SERVICE_ROLE_KEY,
      ADMIN_INITIAL_USER_ID: stack.ownerId,
      ADMIN_TEAM_ID: deployedWorkspace.teamId,
      ADMIN_APP_ID: deployedWorkspace.appId,
      ADMIN_TEAM_NAME: deployedWorkspace.name,
      ADMIN_BOOTSTRAP_KEY: secrets.ADMIN_BOOTSTRAP_KEY,
      ADMIN_SCHEMA_FILE: schemaFile
    });
    const dataBefore = await dataDigest(owner);
    console.info('第二次迁移');
    let secondRun = 'ok';
    try {
      await nx(['run', 'admin-collaboration:migrate'], ownerEnv);
    } catch (error) {
      secondRun = error.message;
    }
    const secondDump = await fullDump(secrets, release);
    const secondProduct = await productDump(secrets, release);
    const secondCatalog = await catalog(owner);
    const dataAfter = await dataDigest(owner);

    await writeFile(path.join(directory, 'schema-first.sql'), firstDump);
    await writeFile(path.join(directory, 'schema-second.sql'), secondDump);
    await writeFile(path.join(directory, 'product-schema.sql'), firstProduct);
    const productTables = firstCatalog.relations.filter(relation => relation.kind !== 'v');
    const published = firstCatalog.publication.filter(
      row =>
        row.schemaname === 'admin_private' ||
        (row.schemaname === 'public' && /^(admin_|shared_records$)/.test(row.tablename))
    );
    const checks = {
      secondRunSucceeded: secondRun === 'ok',
      fullDumpIdentical: firstDump === secondDump,
      productDumpIdentical: firstProduct === secondProduct,
      catalogIdentical: JSON.stringify(firstCatalog) === JSON.stringify(secondCatalog),
      dataUnchanged: JSON.stringify(dataBefore) === JSON.stringify(dataAfter),
      rlsOnEveryProductTable: productTables.every(relation => relation.rls),
      noProductTableInRealtimePublication: published.length === 0,
      realtimeMessagePolicies: firstCatalog.policies.filter(row => row.schemaname === 'realtime').length === 2,
      serviceRoleIsRestricted:
        firstCatalog.role.length === 1 &&
        !firstCatalog.role[0].rolsuper &&
        !firstCatalog.role[0].rolbypassrls &&
        !firstCatalog.role[0].rolcreaterole
    };
    const summary = {
      kind: 'migration-check',
      at: new Date().toISOString(),
      migrations,
      secondRun,
      checks,
      dumps: {
        full: { sha256: sha256(firstDump), bytes: Buffer.byteLength(firstDump), lines: firstDump.split('\n').length },
        product: { sha256: sha256(firstProduct), bytes: Buffer.byteLength(firstProduct) }
      },
      catalog: {
        productTables: productTables.length,
        productViews: firstCatalog.relations.length - productTables.length,
        policies: firstCatalog.policies.length,
        grants: firstCatalog.grants.length,
        columnGrants: firstCatalog.columnGrants.length,
        functions: firstCatalog.functions.length,
        publication: firstCatalog.publication.map(row => `${row.schemaname}.${row.tablename}`),
        role: firstCatalog.role[0]
      },
      data: dataAfter,
      directory: path.relative(stateRoot, directory),
      migrationsRoot: path.relative(path.dirname(stateRoot), migrationsRoot)
    };
    await writeFile(path.join(directory, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
    await writeFile(path.join(directory, 'catalog.json'), `${JSON.stringify(firstCatalog, null, 2)}\n`);
    for (const [name, passed] of Object.entries(checks)) console.info(`${passed ? '✅' : '❌'} ${name}`);
    console.info(
      `结果：${path.relative(process.cwd(), directory)}（整库导出 sha256 ${summary.dumps.full.sha256.slice(0, 12)}）`
    );
    if (!Object.values(checks).every(Boolean)) process.exitCode = 1;
  } finally {
    await owner.end();
  }
}

await main();
