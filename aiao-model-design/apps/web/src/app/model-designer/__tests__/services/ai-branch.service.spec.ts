import { describe, expect, it, vi } from 'vitest';
import { AiBranchService, type BranchChange } from '../../services/ai-branch.service';

describe('AiBranchService', () => {
  // mock VersionManager，签名与 AiBranchService 依赖的 VersionManagerLike 对齐
  function createMockVersionManager() {
    return {
      createBranch: vi.fn<(name: string) => Promise<{ id: string }>>().mockResolvedValue({ id: 'ai-model1-123' }),
      switchBranch: vi.fn<(branchId: string) => Promise<void>>().mockResolvedValue(undefined),
      removeBranch: vi.fn<(branchId: string) => Promise<void>>().mockResolvedValue(undefined),
      mergeBranch: vi
        .fn<
          (
            sourceBranchId: string,
            options?: { strategy?: string; deleteSource?: boolean }
          ) => Promise<{ merged: number; strategy: string; sourceDeleted: boolean }>
        >()
        .mockResolvedValue({ merged: 3, strategy: 'squash', sourceDeleted: true }),
      getCurrentBranch: vi.fn((): Promise<{ id: string; parentId: string | null }> =>
        Promise.resolve({ id: 'main', parentId: null })
      ),
      getChanges: vi.fn<(fromBranch: string, toBranch: string) => Promise<BranchChange[]>>().mockResolvedValue([])
    };
  }

  function createService(versionManager = createMockVersionManager()) {
    return new AiBranchService(versionManager);
  }

  describe('forkAiBranch', () => {
    it('should create branch with ai- prefix and return branchId + parentBranchId', async () => {
      const vm = createMockVersionManager();
      const service = createService(vm);
      const result = await service.forkAiBranch('model1');
      expect(result.branchId).toMatch(/^ai-[0-9a-z]+$/);
      expect(result.parentBranchId).toBe('main');
      expect(vm.createBranch).toHaveBeenCalledOnce();
      expect(vm.switchBranch).toHaveBeenCalledOnce();
    });
  });

  describe('mergeAiBranch', () => {
    it('should switch to parent then merge source branch with squash + deleteSource', async () => {
      const vm = createMockVersionManager();
      const service = createService(vm);
      await service.mergeAiBranch('ai-model1-123', 'main');
      expect(vm.switchBranch).toHaveBeenCalledWith('main');
      expect(vm.mergeBranch).toHaveBeenCalledWith('ai-model1-123', { strategy: 'squash', deleteSource: true });
    });
  });

  describe('discardAiBranch', () => {
    it('should remove branch and switch back to parent', async () => {
      const vm = createMockVersionManager();
      vm.getCurrentBranch.mockResolvedValue({ id: 'ai-model1-123', parentId: 'main' });
      const service = createService(vm);
      await service.discardAiBranch('ai-model1-123', 'main');
      expect(vm.switchBranch).toHaveBeenCalledWith('main');
      expect(vm.removeBranch).toHaveBeenCalledWith('ai-model1-123');
    });
  });

  describe('activeAiBranchId', () => {
    it('当前检出的是 AI 分支时返回它的 ID', async () => {
      const vm = createMockVersionManager();
      vm.getCurrentBranch.mockResolvedValue({ id: 'ai-model1-123', parentId: 'main' });
      expect(await createService(vm).activeAiBranchId()).toBe('ai-model1-123');
    });

    it('当前在普通分支上时返回 null', async () => {
      expect(await createService().activeAiBranchId()).toBeNull();
    });
  });

  describe('compareBranches', () => {
    it('should detect added entities', () => {
      const vm = createMockVersionManager();
      vm.getChanges.mockResolvedValue([{ type: 'entity', action: 'insert', data: { id: 'e1', name: 'User' } }]);
      const service = createService(vm);
      return service.compareBranches('main', 'ai-model1-123').then(diff => {
        expect(diff.added).toHaveLength(1);
        expect(diff.added[0].name).toBe('User');
      });
    });

    it('should detect modified entities', async () => {
      const vm = createMockVersionManager();
      vm.getChanges.mockResolvedValue([
        { type: 'entity', action: 'update', data: { id: 'e1', name: 'User' }, prev: { id: 'e1', name: 'Account' } }
      ]);
      const service = createService(vm);
      const diff = await service.compareBranches('main', 'ai-model1-123');
      expect(diff.modified).toHaveLength(1);
      expect(diff.modified[0].name).toBe('User');
    });

    it('should detect deleted entities', async () => {
      const vm = createMockVersionManager();
      vm.getChanges.mockResolvedValue([{ type: 'entity', action: 'delete', data: { id: 'e1', name: 'Legacy' } }]);
      const service = createService(vm);
      const diff = await service.compareBranches('main', 'ai-model1-123');
      expect(diff.deleted).toHaveLength(1);
      expect(diff.deleted[0].name).toBe('Legacy');
    });

    it('should group property changes under entity', async () => {
      const vm = createMockVersionManager();
      vm.getChanges.mockResolvedValue([
        { type: 'property', action: 'insert', data: { id: 'p1', name: 'email', entityId: 'e1' } },
        {
          type: 'property',
          action: 'update',
          data: { id: 'p2', name: 'age', entityId: 'e1' },
          prev: { id: 'p2', name: 'years', entityId: 'e1' }
        }
      ]);
      const service = createService(vm);
      const diff = await service.compareBranches('main', 'ai-model1-123');
      expect(diff.added).toHaveLength(1);
      expect(diff.modified).toHaveLength(1);
    });

    it('should handle empty changes', async () => {
      const vm = createMockVersionManager();
      vm.getChanges.mockResolvedValue([]);
      const service = createService(vm);
      const diff = await service.compareBranches('main', 'ai-model1-123');
      expect(diff.added).toHaveLength(0);
      expect(diff.modified).toHaveLength(0);
      expect(diff.deleted).toHaveLength(0);
    });
  });

  describe('performance: SC-006 branch ops ≤2s', () => {
    function createMockVm50Entities() {
      const changes = Array.from({ length: 50 }, (_, i): BranchChange => ({
        type: 'entity',
        action: 'insert',
        data: { id: `e${i}`, name: `Entity${i}` }
      }));
      const vm = createMockVersionManager();
      vm.getChanges.mockResolvedValue(changes);
      return vm;
    }

    it('should fork branch in ≤2s', async () => {
      const service = createService();
      const start = performance.now();
      await service.forkAiBranch('model1');
      expect(performance.now() - start).toBeLessThan(2000);
    });

    it('should compare 50-entity diff in ≤2s', async () => {
      const vm = createMockVm50Entities();
      const service = createService(vm);
      const start = performance.now();
      const diff = await service.compareBranches('main', 'ai-branch');
      expect(performance.now() - start).toBeLessThan(2000);
      expect(diff.added).toHaveLength(50);
    });
  });
});
