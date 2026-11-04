/**
 * 打印托管 Supabase 项目要执行的完整 SQL：rxdb 系统表与同步函数、dev-rxdb-p2p 表结构、生产权限，
 * 包在一个事务里。整段粘贴进 SQL Editor 执行，或 `psql --single-transaction -f`。
 *
 * 不含 docker/sql/00（本地 realtime 容器专用）与 03（示例业务表）。顺序与 docker/init-db.sh 的初始化链一致。
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../..', import.meta.url));
const files = [
  'docker/sql/01-rxdb-system-tables.sql',
  'docker/sql/02-rxdb-sync-functions.sql',
  'docker/sql/04-rxdb-utils-functions.sql',
  'apps/dev-rxdb-p2p/supabase/p2p-schema.sql',
  'docker/sql/production/rxdb-change-grants.sql'
];

const sections = files.map(file => `-- ==== ${file} ====\n${readFileSync(`${root}${file}`, 'utf8')}`);
process.stdout.write(['BEGIN;', ...sections, 'COMMIT;', "NOTIFY pgrst, 'reload schema';", ''].join('\n'));
