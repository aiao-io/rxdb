import type { RxDBBranch } from '@aiao/rxdb';
import type { Worktree } from '@aiao/rxdb-plugin-working-tree';
import { SquareStack, Trash2 } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { isImeComposing } from '../utils/ime';
import { WorkingTreeDialogShell } from './DialogShell';

interface NewWorktreeDialogProps {
  readonly open: boolean;
  readonly activeBranch: string;
  readonly branches: readonly RxDBBranch[];
  readonly name: string;
  readonly branchId: string;
  /** 工作树命令此刻不收新请求（写入在途等）：确认与取消一并禁用，与 Angular / Vue 同口径 */
  readonly busy?: boolean;
  readonly creating: boolean;
  readonly error: string | null;
  readonly onNameChange: (name: string) => void;
  readonly onBranchChange: (branchId: string) => void;
  readonly onConfirm: () => void;
  readonly onClose: () => void;
}

export function WorkingTreeNewDialog({
  activeBranch,
  branches,
  branchId,
  busy = false,
  creating,
  error,
  name,
  onBranchChange,
  onClose,
  onConfirm,
  onNameChange,
  open
}: NewWorktreeDialogProps): React.JSX.Element | null {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!open) return undefined;
    const timer = setTimeout(() => input.current?.focus(), 0);
    return () => clearTimeout(timer);
  }, [open]);
  if (!open) return null;
  const canSubmit = name.trim() !== '' && !creating && !busy;
  const submit = (): void => {
    if (canSubmit) onConfirm();
  };
  return (
    <WorkingTreeDialogShell
      labelledBy='wt-worktree-create-title'
      onCloseRequested={creating ? () => undefined : onClose}
      testId='wt-worktree-create-dialog'
    >
      <div className='mb-4 flex items-center gap-2'>
        <SquareStack className='text-[var(--gd-accent)]' aria-hidden='true' size={18} />
        <h2 className='text-[15px] font-semibold' id='wt-worktree-create-title'>
          New worktree
        </h2>
      </div>
      <label className='mb-1 block text-sm font-medium' htmlFor='wt-worktree-create-name'>
        Name
      </label>
      <input
        ref={input}
        autoComplete='off'
        className='gd-input mb-3 w-full'
        data-testid='wt-worktree-create-name'
        id='wt-worktree-create-name'
        onChange={event => onNameChange(event.target.value)}
        onKeyDown={event => {
          if (event.key === 'Enter' && !isImeComposing(event.nativeEvent)) {
            event.preventDefault();
            submit();
          }
        }}
        placeholder='Worktree name'
        type='text'
        value={name}
      />
      <label className='mb-1 block text-sm font-medium' htmlFor='wt-worktree-create-branch'>
        Branch (optional)
      </label>
      <select
        className='gd-input mb-3 w-full'
        data-testid='wt-worktree-create-branch'
        id='wt-worktree-create-branch'
        onChange={event => onBranchChange(event.target.value)}
        value={branchId}
      >
        <option value=''>Create a branch with the worktree name</option>
        {branches.map(branch => (
          <option
            disabled={branch.activeKey !== null && branch.activeKey !== undefined}
            key={branch.id}
            value={branch.id}
          >
            {branch.id}
            {branch.id === activeBranch ?
              ' (current)'
            : branch.activeKey ?
              ' (in use)'
            : ''}
          </option>
        ))}
      </select>
      <p className='mb-3 text-xs' style={{ color: 'var(--gd-muted)' }}>
        The new worktree is opened immediately. Without a branch selection, a new branch with this name is created from{' '}
        {activeBranch} including its uncommitted changes.
      </p>
      {error !== null && (
        <p className='mb-3 text-sm' data-testid='wt-worktree-error' role='alert' style={{ color: 'var(--gd-del-fg)' }}>
          {error}
        </p>
      )}
      <div className='flex justify-end gap-2'>
        <button
          className='gd-btn-secondary'
          data-testid='wt-worktree-create-cancel'
          disabled={creating || busy}
          onClick={onClose}
          type='button'
        >
          Cancel
        </button>
        <button
          className='gd-btn-primary'
          data-testid='wt-worktree-create-confirm'
          disabled={!canSubmit}
          onClick={submit}
          type='button'
        >
          {creating ? 'Creating…' : 'Create worktree'}
        </button>
      </div>
    </WorkingTreeDialogShell>
  );
}

interface RenameWorktreeDialogProps {
  readonly worktree: Worktree | null;
  readonly name: string;
  /** 同 {@link NewWorktreeDialogProps.busy} */
  readonly busy?: boolean;
  readonly saving: boolean;
  readonly error: string | null;
  readonly onNameChange: (name: string) => void;
  readonly onConfirm: () => void;
  readonly onClose: () => void;
}

export function WorkingTreeRenameDialog({
  busy = false,
  error,
  name,
  onClose,
  onConfirm,
  onNameChange,
  saving,
  worktree
}: RenameWorktreeDialogProps): React.JSX.Element | null {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (worktree === null) return undefined;
    const timer = setTimeout(() => input.current?.focus(), 0);
    return () => clearTimeout(timer);
  }, [worktree]);
  if (worktree === null) return null;
  const canSubmit = name.trim() !== '' && !saving && !busy;
  return (
    <WorkingTreeDialogShell
      labelledBy='wt-worktree-rename-title'
      onCloseRequested={saving ? () => undefined : onClose}
      testId='wt-worktree-rename-dialog'
    >
      <h2 className='mb-4 text-[15px] font-semibold' id='wt-worktree-rename-title'>
        Rename worktree
      </h2>
      <label className='mb-1 block text-sm font-medium' htmlFor='wt-worktree-rename-name'>
        Name
      </label>
      <input
        ref={input}
        autoComplete='off'
        className='gd-input mb-3 w-full'
        data-testid='wt-worktree-rename-name'
        id='wt-worktree-rename-name'
        onChange={event => onNameChange(event.target.value)}
        onKeyDown={event => {
          if (event.key === 'Enter' && !isImeComposing(event.nativeEvent)) {
            event.preventDefault();
            if (canSubmit) onConfirm();
          }
        }}
        type='text'
        value={name}
      />
      {error !== null && (
        <p className='mb-3 text-sm' data-testid='wt-worktree-error' role='alert' style={{ color: 'var(--gd-del-fg)' }}>
          {error}
        </p>
      )}
      <div className='flex justify-end gap-2'>
        <button
          className='gd-btn-secondary'
          data-testid='wt-worktree-rename-cancel'
          disabled={saving || busy}
          onClick={onClose}
          type='button'
        >
          Cancel
        </button>
        <button
          className='gd-btn-primary'
          data-testid='wt-worktree-rename-confirm'
          disabled={!canSubmit}
          onClick={onConfirm}
          type='button'
        >
          {saving ? 'Saving…' : 'Rename'}
        </button>
      </div>
    </WorkingTreeDialogShell>
  );
}

interface DeleteWorktreeDialogProps {
  readonly worktree: Worktree | null;
  readonly dirty: boolean;
  /** 同 {@link NewWorktreeDialogProps.busy} */
  readonly busy?: boolean;
  readonly deleting: boolean;
  readonly error: string | null;
  readonly onConfirm: () => void;
  readonly onClose: () => void;
}

export function WorkingTreeDeleteDialog({
  worktree,
  dirty,
  busy = false,
  deleting,
  error,
  onClose,
  onConfirm
}: DeleteWorktreeDialogProps): React.JSX.Element | null {
  if (worktree === null) return null;
  return (
    <WorkingTreeDialogShell
      labelledBy='wt-worktree-delete-title'
      onCloseRequested={deleting ? () => undefined : onClose}
      testId='wt-worktree-delete-dialog'
    >
      <div className='mb-4 flex items-center gap-2'>
        <Trash2 className='text-[var(--gd-del-fg)]' aria-hidden='true' size={18} />
        <h2 className='text-[15px] font-semibold' id='wt-worktree-delete-title'>
          Delete worktree
        </h2>
      </div>
      <p className='mb-3 text-sm'>
        Delete <strong>{worktree.name ?? worktree.branchId}</strong>?
      </p>
      {dirty && (
        <p
          className='mb-3 text-sm'
          data-testid='wt-worktree-delete-warning'
          role='alert'
          style={{ color: 'var(--gd-del-fg)' }}
        >
          This worktree has uncommitted changes. Deleting it will remove the worktree tables; the branch changes remain
          available when you check out the branch again.
        </p>
      )}
      {error !== null && (
        <p className='mb-3 text-sm' data-testid='wt-worktree-error' role='alert' style={{ color: 'var(--gd-del-fg)' }}>
          {error}
        </p>
      )}
      <div className='flex justify-end gap-2'>
        <button
          className='gd-btn-secondary'
          data-testid='wt-worktree-delete-cancel'
          disabled={deleting || busy}
          onClick={onClose}
          type='button'
        >
          Cancel
        </button>
        <button
          className='gd-btn-danger'
          data-testid='wt-worktree-delete-confirm'
          disabled={deleting || busy}
          onClick={onConfirm}
          type='button'
        >
          {deleting ? 'Deleting…' : 'Delete'}
        </button>
      </div>
    </WorkingTreeDialogShell>
  );
}
