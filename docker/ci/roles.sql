-- CI 专用角色密码初始化
-- 仅设置 CI 环境必需的角色密码（rest, auth 服务）
\set pgpass `echo "$POSTGRES_PASSWORD"`

ALTER USER authenticator WITH PASSWORD :'pgpass';
ALTER USER supabase_auth_admin WITH PASSWORD :'pgpass';
