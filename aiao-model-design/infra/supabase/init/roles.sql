-- supabase/postgres 镜像已经建好服务角色，这里只在数据卷首次初始化时设置密码；
-- 之后每次 supabase-up 都会用 .env 里的 POSTGRES_PASSWORD 再同步一次（见 supabase-local.mjs）。
\set pgpass `echo "$POSTGRES_PASSWORD"`
ALTER USER supabase_auth_admin WITH PASSWORD :'pgpass';
ALTER USER supabase_admin WITH PASSWORD :'pgpass';
