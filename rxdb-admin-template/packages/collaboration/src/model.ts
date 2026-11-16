export const permissions = ['read', 'edit', 'comment', 'review', 'merge', 'manage'] as const;
export type Permission = (typeof permissions)[number];
export type Value = string | number | boolean | null;
export type DataRow = { entity: 'AssetCategory' | 'Asset' | 'AssetEvent'; fields: Record<string, Value> };
export type Records = Record<string, DataRow>;
export interface Identity {
  id: string;
  email: string;
  verified: boolean;
}
export interface Member {
  id: string;
  email: string;
  permissions: Permission[];
  generation: number;
  active: boolean;
}
export interface Commit {
  id: string;
  parent: string | null;
  authorId: string;
  message: string;
  records: Records;
  mergeSource?: string;
  candidateId?: string;
}
export interface Task {
  id: string;
  name: string;
  ownerId: string;
  base: string | null;
  head: string | null;
  originTaskId: string | null;
}
export interface Stage {
  id: string;
  name: string;
  minimum: number;
  reviewers: string[];
  after: string[];
}
export interface Policy {
  version: number;
  stages: Stage[];
}
export interface PullRequest {
  id: string;
  taskId: string;
  authorId: string;
  title: string;
  description: string;
  target: 'shared';
  status: 'draft' | 'review' | 'closed' | 'merged';
  revision: number;
  candidateId: string | null;
  subscribers: string[];
}
export interface Resolution {
  key: string;
  choice: 'source' | 'target' | 'custom';
  value?: Value | DataRow;
}
export interface Conflict {
  key: string;
  recordId: string;
  field: string | null;
  base: Value | DataRow | undefined;
  source: Value | DataRow | undefined;
  target: Value | DataRow | undefined;
}
export interface Check {
  recordId: string;
  field: string;
  message: string;
}
export interface Candidate {
  id: string;
  prId: string;
  base: string | null;
  source: string;
  target: string | null;
  schemaVersion: number;
  policyVersion: number;
  resolutions: Resolution[];
  records: Records;
  conflicts: Conflict[];
  checks: Check[];
  actorId: string;
  at: number;
}
export interface Review {
  id: string;
  prId: string;
  reviewerId: string;
  candidateId: string | null;
  stageId: string;
  decision: 'approve' | 'request_changes' | 'dismiss';
  generation: number;
  revision: number;
  reason: string;
  at: number;
  dismissedReviewerId?: string;
}
export interface Comment {
  id: string;
  authorId: string;
  body: string;
  deleted: boolean;
  revision: number;
  at: number;
}
export interface Thread {
  id: string;
  prId: string;
  candidateId: string | null;
  recordId: string | null;
  field: string | null;
  required: boolean;
  resolved: boolean;
  revision: number;
  comments: Comment[];
}
export interface Invitation {
  id: string;
  email: string;
  permissions: Permission[];
  inviterId: string;
  tokenHash: string;
  version: number;
  expiresAt: number;
  state: 'pending' | 'revoked' | 'accepted';
  acceptedBy: string | null;
}
export interface Notice {
  id: string;
  userId: string;
  prId: string;
  threadId: string | null;
  candidateId: string | null;
  read: boolean;
  at: number;
}
export interface Presence {
  userId: string;
  sessionId: string;
  prId: string | null;
  recordId: string | null;
  expiresAt: number;
}
export interface Audit {
  id: string;
  actorId: string;
  action: string;
  operationId: string;
  at: number;
  details: Record<string, unknown>;
}
export interface Receipt {
  operationId: string;
  actorId: string;
  fingerprint: string;
  value: Record<string, unknown>;
}
export interface Workspace {
  teamId: string;
  appId: string;
  name: string;
  bootstrapKey: string;
  initialAdminId: string;
  schemaVersion: number;
  revision: number;
  head: string | null;
  records: Records;
  policy: Policy;
  members: Record<string, Member>;
  tasks: Record<string, Task>;
  commits: Record<string, Commit>;
  prs: Record<string, PullRequest>;
  candidates: Record<string, Candidate>;
  invitations: Record<string, Invitation>;
  reviews: Review[];
  threads: Record<string, Thread>;
  notifications: Notice[];
  presence: Presence[];
  receipts: Record<string, Receipt>;
  audit: Audit[];
}
interface Operation {
  operationId: string;
}
export type Command = Operation &
  (
    | {
        type: 'invite';
        id: string;
        email: string;
        permissions: Permission[];
        tokenHash: string;
        expiresAt: number;
        expectedVersion: number;
      }
    | { type: 'revoke_invite'; id: string; expectedVersion: number }
    | { type: 'accept_invite'; id: string; tokenHash: string }
    | { type: 'member'; userId: string; permissions: Permission[]; active: boolean; expectedGeneration: number }
    | { type: 'policy'; stages: Stage[]; expectedVersion: number }
    | { type: 'task'; id: string; name: string; expectedHead: string | null }
    | { type: 'upload'; taskId: string; expectedHead: string | null; commits: Commit[] }
    | { type: 'fork'; id: string; name: string; taskId: string; expectedHead: string | null; commits: Commit[] }
    | { type: 'pr'; id: string; taskId: string; title: string; description: string; target: 'shared' }
    | { type: 'pr_state'; prId: string; status: 'draft' | 'review' | 'closed'; expectedRevision: number }
    | { type: 'candidate'; prId: string; expectedRevision: number; resolutions: Resolution[] }
    | {
        type: 'review';
        prId: string;
        candidateId: string;
        stageId: string;
        decision: 'approve' | 'request_changes';
        reason: string;
        expectedRevision: number;
      }
    | { type: 'dismiss'; prId: string; reviewerId: string; reason: string; expectedRevision: number }
    | {
        type: 'thread';
        id: string;
        prId: string;
        candidateId: string | null;
        recordId: string | null;
        field: string | null;
        body: string;
        required: boolean;
        mentions: string[];
      }
    | { type: 'reply'; threadId: string; body: string; mentions: string[] }
    | {
        type: 'edit_comment';
        threadId: string;
        commentId: string;
        body: string;
        deleted: boolean;
        expectedRevision: number;
      }
    | { type: 'resolve_thread'; threadId: string; resolved: boolean; expectedRevision: number }
    | { type: 'subscribe'; prId: string; subscribed: boolean }
    | { type: 'read_notice'; id: string }
    | { type: 'presence'; sessionId: string; prId: string | null; recordId: string | null; leave: boolean }
    | { type: 'merge'; prId: string; candidateId: string; expectedSource: string; expectedTarget: string | null }
  );
export interface Environment {
  now: number;
  id: () => string;
}
export class CollaborationError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly details: Record<string, unknown> = {}
  ) {
    super(message);
    this.name = 'CollaborationError';
  }
}
export function demand(
  condition: unknown,
  code: string,
  message: string,
  details: Record<string, unknown> = {}
): asserts condition {
  if (!condition) throw new CollaborationError(code, message, details);
}
