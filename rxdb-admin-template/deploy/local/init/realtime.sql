-- Realtime 的内部 schema 必须在 initdb 阶段建好：realtime 容器连库后先 `SET search_path TO _realtime` 再跑自己的迁移，
-- schema 不存在时直接退出且不会自愈（与 docker/docker-compose.ci.yml 的做法相同）。
CREATE SCHEMA IF NOT EXISTS _realtime;
ALTER SCHEMA _realtime OWNER TO supabase_admin;
