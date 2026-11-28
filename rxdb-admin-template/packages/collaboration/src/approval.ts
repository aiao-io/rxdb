import type { CandidateSummary, Member, Policy, PullRequest, Review, StageProgress } from './model.js';

/**
 * 审批进度的纯规则：引擎裁决批准与合并时用它，浏览器展示 PR 详情时用同一份规则推导阻塞意见与阶段进度，
 * 两边看到的永远一致。`reviews` 是该 PR 的审核记录（按写入顺序），`members` 以成员 ID 为键。
 */

/** 某个审核者在 PR 上的最新审核版本号（撤销阻塞意见记在被撤销者名下）；没有审核过为 0。 */
export function reviewRevision(reviews: readonly Review[], prId: string, reviewerId: string): number {
  return reviews
    .filter(
      r =>
        r.prId === prId &&
        (r.decision === 'dismiss' ? r.dismissedReviewerId === reviewerId : r.reviewerId === reviewerId)
    )
    .reduce((revision, r) => Math.max(revision, r.revision), 0);
}
/** 仍然生效的要求修改：每个审核者最后一次要求修改，之后被本人批准或被撤销即失效。 */
export function activeBlockers(reviews: readonly Review[], prId: string): Review[] {
  const active = new Map<string, Review>();
  for (const review of reviews.filter(r => r.prId === prId)) {
    if (review.decision === 'request_changes') active.set(review.reviewerId, review);
    else active.delete(review.dismissedReviewerId ?? review.reviewerId);
  }
  return [...active.values()];
}
/**
 * 一次批准是否对当前候选有效：批准的就是这个候选、审核者不是 PR 作者、仍是有审核权的有效成员，
 * 且授权代次没有变过（授权变更后旧批准作废）。
 */
function validApproval(
  members: Readonly<Record<string, Member>>,
  pr: PullRequest,
  candidate: Pick<CandidateSummary, 'id'>,
  review: Review
): boolean {
  const member = Object.hasOwn(members, review.reviewerId) ? members[review.reviewerId] : undefined;
  return (
    review.decision === 'approve' &&
    review.candidateId === candidate.id &&
    review.reviewerId !== pr.authorId &&
    !!member?.active &&
    member.generation === review.generation &&
    member.permissions.includes('review')
  );
}
/** 当前候选在各审批阶段的进度：每个审核者在该阶段的最新审核里，有效批准且是阶段指定审核人（未指定则任何人）的人数。 */
export function stageProgress(
  policy: Policy,
  members: Readonly<Record<string, Member>>,
  reviews: readonly Review[],
  pr: PullRequest,
  candidate: Pick<CandidateSummary, 'id'>
): StageProgress[] {
  return policy.stages.map(stage => {
    const latest = new Map<string, Review>();
    for (const review of reviews.filter(r => r.prId === pr.id && r.stageId === stage.id))
      latest.set(review.reviewerId, review);
    const approved = [...latest.values()].filter(
      r =>
        validApproval(members, pr, candidate, r) && (!stage.reviewers.length || stage.reviewers.includes(r.reviewerId))
    );
    return {
      id: stage.id,
      name: stage.name,
      minimum: stage.minimum,
      approved: approved.length,
      complete: approved.length >= stage.minimum
    };
  });
}
