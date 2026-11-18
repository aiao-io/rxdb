-- 本地预演栈的数据库初始化（ADMIN-US-217）：supabase/postgres 镜像已建好 Supabase 的内置角色，这里按本机随机口令
-- （.env.local 的 POSTGRES_PASSWORD，经容器环境变量传入）设置 GoTrue、PostgREST、Realtime 与 Studio 连库用的口令。
-- 协作专用角色 admin_collaboration 不在这里：它由产品迁移建出（NOLOGIN），口令由发布流水线的第 2 步设置。
\set pgpass `echo "$POSTGRES_PASSWORD"`
ALTER USER authenticator WITH PASSWORD :'pgpass';
ALTER USER supabase_auth_admin WITH PASSWORD :'pgpass';
ALTER USER supabase_storage_admin WITH PASSWORD :'pgpass';
ALTER USER supabase_admin WITH PASSWORD :'pgpass';
