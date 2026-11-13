import { describe, expect, it } from 'vitest';
import { AiOperationGuardService } from '../../services/ai-operation-guard.service';

describe('AiOperationGuardService', () => {
  function createService() {
    return new AiOperationGuardService();
  }

  it('should allow AI operation when no pending branch', () => {
    const service = createService();
    expect(service.canStartAiOperation()).toBe(true);
  });

  it('should block AI operation when pending branch exists', () => {
    const service = createService();
    service.setPendingBranch('ai-model1-123');
    expect(service.canStartAiOperation()).toBe(false);
  });

  it('should allow AI operation after pending branch is cleared', () => {
    const service = createService();
    service.setPendingBranch('ai-model1-123');
    expect(service.canStartAiOperation()).toBe(false);
    service.clearPendingBranch();
    expect(service.canStartAiOperation()).toBe(true);
  });

  it('should return pending branch id', () => {
    const service = createService();
    expect(service.pendingBranchId()).toBeNull();
    service.setPendingBranch('ai-model1-123');
    expect(service.pendingBranchId()).toBe('ai-model1-123');
  });

  it('should reject concurrent AI operations', () => {
    const service = createService();
    service.setPendingBranch('ai-model1-123');
    expect(service.canStartAiOperation()).toBe(false);
    // 尝试设置另一个分支不应覆盖
    service.setPendingBranch('ai-model1-456');
    // 仍然被阻塞，但现在是新的分支
    expect(service.canStartAiOperation()).toBe(false);
    expect(service.pendingBranchId()).toBe('ai-model1-456');
  });

  it('should provide blocking reason message', () => {
    const service = createService();
    expect(service.blockingReason()).toBeNull();
    service.setPendingBranch('ai-model1-123');
    expect(service.blockingReason()).toBeTruthy();
  });
});
