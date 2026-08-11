import { RxDBBranch } from '@aiao/rxdb';
import { useFindAll, useRxDB } from '@aiao/rxdb-react';
import { GitBranch, Plus } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useResettableTimeout } from '../hooks/useResettableTimeout';

export function AppBranchManager() {
  const rxdb = useRxDB();
  const [switching, setSwitching] = useState(false);
  const [branchName, setBranchName] = useState('');
  const [showPopover, setShowPopover] = useState(false);
  const [switchError, setSwitchError] = useState<string | null>(null);
  const popoverInputRef = useRef<HTMLInputElement>(null);
  const { schedule: schedulePopoverFocus } = useResettableTimeout();

  const branchesResource = useFindAll(RxDBBranch, { where: { combinator: 'and', rules: [] } });
  // P2-4：`RxDBResource.value` 是非可选的 `T`（useFindAll 的默认值就是 `[]`），
  // `?? []` 既是死代码又谎称它可能是 nullish；去掉后这层 useMemo 也只剩恒等映射，一并删掉。
  const branches = branchesResource.value;
  const activeBranch = useMemo(() => branches.find(b => b.activated)?.id ?? '', [branches]);

  useEffect(() => {
    if (showPopover) {
      schedulePopoverFocus(() => popoverInputRef.current?.focus(), 0);
    }
  }, [schedulePopoverFocus, showPopover]);

  const togglePopover = () => setShowPopover(v => !v);
  const closePopover = () => setShowPopover(false);

  const createBranch = async (name: string) => {
    if (!name.trim()) return;
    try {
      await rxdb.versionManager.createBranch(name.trim());
      setBranchName('');
      closePopover();
    } catch (error) {
      console.error(error);
    }
  };

  const switchBranch = async (event: React.ChangeEvent<HTMLSelectElement>) => {
    const branch = event.target.value;
    setSwitching(true);
    setSwitchError(null);
    try {
      await rxdb.versionManager.switchBranch(branch);
    } catch (error) {
      setSwitchError(error instanceof Error ? error.message : String(error));
    } finally {
      setSwitching(false);
    }
  };

  return (
    <div className='relative flex items-center gap-1.5 p-1'>
      <div className='join'>
        <div>
          <span className='btn btn-xs join-item flex items-center px-2 text-xs'>
            <GitBranch size={16} />
          </span>
        </div>
        <select
          aria-label='当前分支'
          className='select select-xs join-item'
          disabled={switching}
          value={activeBranch}
          onChange={switchBranch}
        >
          {branches.map(branch => (
            <option key={branch.id} value={branch.id}>
              {branch.id}
            </option>
          ))}
        </select>
      </div>

      {switching && <span className='loading loading-spinner loading-xs pointer-events-none absolute right-6' />}
      {switchError && (
        <span role='alert' className='text-error max-w-48 truncate text-xs' title={switchError}>
          {switchError}
        </span>
      )}

      {/* 创建分支按钮 */}
      <button className='btn btn-xs btn-ghost btn-circle' disabled={switching} title='创建分支' onClick={togglePopover}>
        <Plus size={16} />
      </button>

      {/* Popover 弹出框 */}
      {showPopover && (
        <div className='bg-base-100 border-base-300 absolute bottom-full left-0 z-50 mb-2 rounded-lg border p-3 shadow-xl'>
          <div className='flex flex-col gap-2'>
            <div className='text-xs font-medium'>创建新分支</div>
            <input
              ref={popoverInputRef}
              className='input input-sm input-bordered w-48'
              placeholder='输入分支名称'
              type='text'
              value={branchName}
              onChange={e => setBranchName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') createBranch(branchName);
                if (e.key === 'Escape') closePopover();
              }}
            />
            <div className='flex justify-end gap-2'>
              <button className='btn btn-ghost btn-sm' onClick={closePopover}>
                取消
              </button>
              <button
                className='btn btn-primary btn-sm'
                disabled={!branchName.trim()}
                onClick={() => createBranch(branchName)}
              >
                创建
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
