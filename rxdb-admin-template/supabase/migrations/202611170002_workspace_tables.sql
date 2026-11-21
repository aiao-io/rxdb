BEGIN;
-- 工作区整行 JSONB 拆表（ADMIN-US-218 切片 D）：治理行只剩名称、初始化归属、数据模式版本与当前策略版本，
-- 成员、策略、任务与引用、PR、候选、审核、讨论、评论、通知、邀请、回执各自成表，命令只读写它涉及的行。
-- 锁顺序：治理行（普通命令 FOR SHARE，成员、邀请、策略命令 FOR UPDATE）→ PR 行（FOR UPDATE）→ 引用行
-- （上传锁任务引用；合并先锁共享引用再锁任务引用）→ 版本行（每个写事务的最后一步）。
-- 全部语句幂等：可在已执行过 202611160001 / 202611170001 的库上重复执行，也不改写前两个迁移会重建的对象
-- （memberships 表与 can_read() 保持原名原义，单独重跑前两个迁移不会使结构变化）。

-- 治理行：普通命令只对它加 FOR SHARE、从不更新它；只有成员、邀请与策略命令持 FOR UPDATE 时才改写。
-- 修订号不在这里（见 admin_workspace_versions），否则两个同持共享锁的命令都要升级为排他锁，互相等待成死锁。
ALTER TABLE admin_private.workspaces ADD COLUMN IF NOT EXISTS name text NOT NULL DEFAULT '';
ALTER TABLE admin_private.workspaces ADD COLUMN IF NOT EXISTS bootstrap_key text NOT NULL DEFAULT '';
ALTER TABLE admin_private.workspaces ADD COLUMN IF NOT EXISTS initial_admin_id text NOT NULL DEFAULT '';
ALTER TABLE admin_private.workspaces ADD COLUMN IF NOT EXISTS schema_version integer NOT NULL DEFAULT 1;
ALTER TABLE admin_private.workspaces ADD COLUMN IF NOT EXISTS policy_version integer NOT NULL DEFAULT 1;
-- 产品尚未部署，旧的整行状态不迁移，直接删除
ALTER TABLE admin_private.workspaces DROP COLUMN IF EXISTS state;

-- 成员：沿用 memberships（RLS 的 can_read() 读它），补齐权限、代际与启用状态；can_read 改为由权限推导的生成列，
-- 不会与权限不一致。按团队/应用走主键，按用户（「我的工作区」）走 memberships_user。
ALTER TABLE admin_private.memberships ADD COLUMN IF NOT EXISTS email text NOT NULL DEFAULT '';
ALTER TABLE admin_private.memberships ADD COLUMN IF NOT EXISTS permissions text[] NOT NULL DEFAULT '{}';
ALTER TABLE admin_private.memberships ADD COLUMN IF NOT EXISTS generation integer NOT NULL DEFAULT 0;
ALTER TABLE admin_private.memberships ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT false;
-- 加入顺序：成员列表按它排列，与原先状态里的插入顺序一致
ALTER TABLE admin_private.memberships ADD COLUMN IF NOT EXISTS seq bigint GENERATED ALWAYS AS IDENTITY;
DO $$ BEGIN
  IF (SELECT attgenerated FROM pg_attribute
      WHERE attrelid = 'admin_private.memberships'::regclass AND attname = 'can_read' AND NOT attisdropped) <> 's' THEN
    ALTER TABLE admin_private.memberships DROP COLUMN can_read;
    ALTER TABLE admin_private.memberships
      ADD COLUMN can_read boolean GENERATED ALWAYS AS (active AND 'read' = ANY (permissions)) STORED;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS memberships_user ON admin_private.memberships (user_id);

-- 审批策略：按版本只追加，治理行的 policy_version 指向当前版本。
CREATE TABLE IF NOT EXISTS admin_private.policies (
  team_id text NOT NULL,
  app_id text NOT NULL,
  version integer NOT NULL,
  stages jsonb NOT NULL,
  PRIMARY KEY (team_id, app_id, version),
  FOREIGN KEY (team_id, app_id) REFERENCES admin_private.workspaces(team_id, app_id),
  CHECK (jsonb_typeof(stages) = 'array')
);

-- 任务的不可变元数据（名称、所有者、共同起点、另存来源）；任务头在 refs。
CREATE TABLE IF NOT EXISTS admin_private.tasks (
  team_id text NOT NULL,
  app_id text NOT NULL,
  id text NOT NULL,
  name text NOT NULL,
  owner_id text NOT NULL,
  base text,
  origin_task_id text,
  seq bigint GENERATED ALWAYS AS IDENTITY,
  PRIMARY KEY (team_id, app_id, id),
  FOREIGN KEY (team_id, app_id) REFERENCES admin_private.workspaces(team_id, app_id),
  FOREIGN KEY (team_id, app_id, base) REFERENCES admin_private.commits(team_id, app_id, id),
  FOREIGN KEY (team_id, app_id, origin_task_id) REFERENCES admin_private.tasks(team_id, app_id, id)
);

-- 引用：共享分支（shared）与任务分支（tasks/<任务 ID>）的头及修订号，只经比较交换推进。
CREATE TABLE IF NOT EXISTS admin_private.refs (
  team_id text NOT NULL,
  app_id text NOT NULL,
  ref text NOT NULL,
  head text,
  revision bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (team_id, app_id, ref),
  FOREIGN KEY (team_id, app_id) REFERENCES admin_private.workspaces(team_id, app_id),
  FOREIGN KEY (team_id, app_id, head) REFERENCES admin_private.commits(team_id, app_id, id),
  CHECK (ref = 'shared' OR ref LIKE 'tasks/%')
);

-- 数据 PR：状态、修订号、当前候选与订阅者；PR 相关命令对它加 FOR UPDATE。
CREATE TABLE IF NOT EXISTS admin_private.prs (
  team_id text NOT NULL,
  app_id text NOT NULL,
  id text NOT NULL,
  task_id text NOT NULL,
  author_id text NOT NULL,
  title text NOT NULL,
  description text NOT NULL,
  target text NOT NULL,
  status text NOT NULL,
  revision integer NOT NULL,
  candidate_id text,
  subscribers text[] NOT NULL DEFAULT '{}',
  seq bigint GENERATED ALWAYS AS IDENTITY,
  PRIMARY KEY (team_id, app_id, id),
  FOREIGN KEY (team_id, app_id, task_id) REFERENCES admin_private.tasks(team_id, app_id, id),
  CHECK (target = 'shared'),
  CHECK (status IN ('draft', 'review', 'closed', 'merged'))
);
CREATE INDEX IF NOT EXISTS prs_task ON admin_private.prs (team_id, app_id, task_id);

-- 合并候选：不可变，含 B/S/T、冲突选择、冲突、检查、规则版本，以及最终结果相对 T 的字段级变更。
CREATE TABLE IF NOT EXISTS admin_private.candidates (
  team_id text NOT NULL,
  app_id text NOT NULL,
  id text NOT NULL,
  pr_id text NOT NULL,
  base text,
  source text NOT NULL,
  target text,
  schema_version integer NOT NULL,
  policy_version integer NOT NULL,
  resolutions jsonb NOT NULL,
  conflicts jsonb NOT NULL,
  checks jsonb NOT NULL,
  actor_id text NOT NULL,
  at bigint NOT NULL,
  changes jsonb NOT NULL,
  seq bigint GENERATED ALWAYS AS IDENTITY,
  PRIMARY KEY (team_id, app_id, id),
  FOREIGN KEY (team_id, app_id, pr_id) REFERENCES admin_private.prs(team_id, app_id, id)
);
CREATE INDEX IF NOT EXISTS candidates_pr ON admin_private.candidates (team_id, app_id, pr_id);

-- 审核记录：只追加，按 seq 保持写入顺序（阻塞意见与阶段进度依赖它）。
CREATE TABLE IF NOT EXISTS admin_private.reviews (
  team_id text NOT NULL,
  app_id text NOT NULL,
  id text NOT NULL,
  pr_id text NOT NULL,
  reviewer_id text NOT NULL,
  source text,
  candidate_id text,
  stage_id text NOT NULL,
  decision text NOT NULL,
  generation integer NOT NULL,
  revision integer NOT NULL,
  reason text NOT NULL,
  at bigint NOT NULL,
  dismissed_reviewer_id text,
  seq bigint GENERATED ALWAYS AS IDENTITY,
  PRIMARY KEY (team_id, app_id, id),
  FOREIGN KEY (team_id, app_id, pr_id) REFERENCES admin_private.prs(team_id, app_id, id),
  CHECK (decision IN ('approve', 'request_changes', 'dismiss'))
);
CREATE INDEX IF NOT EXISTS reviews_pr ON admin_private.reviews (team_id, app_id, pr_id, seq);

-- 讨论线程与字段定位；评论单独成行，按 seq 保持顺序。
CREATE TABLE IF NOT EXISTS admin_private.threads (
  team_id text NOT NULL,
  app_id text NOT NULL,
  id text NOT NULL,
  pr_id text NOT NULL,
  candidate_id text,
  record_id text,
  field text,
  required boolean NOT NULL,
  resolved boolean NOT NULL,
  resolved_candidate_id text,
  revision integer NOT NULL,
  seq bigint GENERATED ALWAYS AS IDENTITY,
  PRIMARY KEY (team_id, app_id, id),
  FOREIGN KEY (team_id, app_id, pr_id) REFERENCES admin_private.prs(team_id, app_id, id)
);
CREATE INDEX IF NOT EXISTS threads_pr ON admin_private.threads (team_id, app_id, pr_id, seq);
CREATE TABLE IF NOT EXISTS admin_private.comments (
  team_id text NOT NULL,
  app_id text NOT NULL,
  id text NOT NULL,
  thread_id text NOT NULL,
  author_id text NOT NULL,
  body text NOT NULL,
  deleted boolean NOT NULL,
  revision integer NOT NULL,
  at bigint NOT NULL,
  seq bigint GENERATED ALWAYS AS IDENTITY,
  PRIMARY KEY (team_id, app_id, id),
  FOREIGN KEY (team_id, app_id, thread_id) REFERENCES admin_private.threads(team_id, app_id, id)
);
CREATE INDEX IF NOT EXISTS comments_thread ON admin_private.comments (team_id, app_id, thread_id, seq);

-- 站内通知：只追加，加已读标记；按接收者分页读取。
CREATE TABLE IF NOT EXISTS admin_private.notifications (
  team_id text NOT NULL,
  app_id text NOT NULL,
  id text NOT NULL,
  user_id text NOT NULL,
  pr_id text NOT NULL,
  thread_id text,
  candidate_id text,
  read boolean NOT NULL,
  at bigint NOT NULL,
  seq bigint GENERATED ALWAYS AS IDENTITY,
  PRIMARY KEY (team_id, app_id, id),
  FOREIGN KEY (team_id, app_id, pr_id) REFERENCES admin_private.prs(team_id, app_id, id)
);
CREATE INDEX IF NOT EXISTS notifications_user ON admin_private.notifications (team_id, app_id, user_id, seq);

-- 邀请：令牌只存摘要，受邀邮箱小写；只经成员命令（治理行 FOR UPDATE）写入。
CREATE TABLE IF NOT EXISTS admin_private.invitations (
  team_id text NOT NULL,
  app_id text NOT NULL,
  id text NOT NULL,
  email text NOT NULL,
  permissions text[] NOT NULL,
  inviter_id text NOT NULL,
  token_hash text NOT NULL,
  version integer NOT NULL,
  expires_at bigint NOT NULL,
  state text NOT NULL,
  accepted_by text,
  seq bigint GENERATED ALWAYS AS IDENTITY,
  PRIMARY KEY (team_id, app_id, id),
  FOREIGN KEY (team_id, app_id) REFERENCES admin_private.workspaces(team_id, app_id),
  CHECK (state IN ('pending', 'revoked', 'accepted'))
);

-- 幂等回执：保留 30 天，按 at 有界清理；同一操作 ID 在保留期内重试返回原结果。
CREATE TABLE IF NOT EXISTS admin_private.operations (
  team_id text NOT NULL,
  app_id text NOT NULL,
  operation_id text NOT NULL,
  actor_id text NOT NULL,
  fingerprint text NOT NULL,
  result jsonb NOT NULL,
  at bigint NOT NULL,
  PRIMARY KEY (team_id, app_id, operation_id),
  FOREIGN KEY (team_id, app_id) REFERENCES admin_private.workspaces(team_id, app_id)
);
CREATE INDEX IF NOT EXISTS operations_age ON admin_private.operations (team_id, app_id, at);

-- 审计成为唯一的审计存储（只追加，不删除）：seq 给出写入顺序，pr_id / thread_id 供按 PR、按线程分页。
ALTER TABLE public.admin_audit ADD COLUMN IF NOT EXISTS seq bigint GENERATED ALWAYS AS IDENTITY;
ALTER TABLE public.admin_audit ADD COLUMN IF NOT EXISTS pr_id text;
ALTER TABLE public.admin_audit ADD COLUMN IF NOT EXISTS thread_id text;
CREATE INDEX IF NOT EXISTS admin_audit_order ON public.admin_audit (team_id, app_id, seq);
CREATE INDEX IF NOT EXISTS admin_audit_pr ON public.admin_audit (team_id, app_id, pr_id, seq) WHERE pr_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS admin_audit_thread ON public.admin_audit (team_id, app_id, thread_id, seq)
  WHERE thread_id IS NOT NULL;

-- 版本行：全局修订号与审计条数，每个写事务在提交前的最后一步加一；客户端经 Realtime 订阅它的变化。
-- 写事务之间只在这最后一步排队（持锁时间只覆盖提交本身），其余步骤按各自涉及的行并行。
ALTER TABLE public.admin_workspace_versions ADD COLUMN IF NOT EXISTS audit_count bigint NOT NULL DEFAULT 0;

REVOKE ALL ON admin_private.policies, admin_private.tasks, admin_private.refs, admin_private.prs,
  admin_private.candidates, admin_private.reviews, admin_private.threads, admin_private.comments,
  admin_private.notifications, admin_private.invitations, admin_private.operations
  FROM PUBLIC, anon, authenticated;
ALTER TABLE admin_private.policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_private.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_private.refs ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_private.prs ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_private.candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_private.reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_private.threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_private.comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_private.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_private.invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_private.operations ENABLE ROW LEVEL SECURITY;
COMMIT;
