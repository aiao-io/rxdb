import { GitBranch } from 'lucide-react';
import { WorkingTreeDialogShell } from './DialogShell';

/** 「Switch branch」对话框的状态；页面持有，本组件只做展示与转发。 */
export interface SwitchBranchDialogState {
  /** 要切去的分支 */
  readonly targetBranchId: string;
}

interface WorkingTreeSwitchBranchDialogProps {
  readonly dialog: SwitchBranchDialogState | null;
  /** 当前分支：改动留在它上面 */
  readonly activeBranch: string;
  /** 切换进行中：确认按钮置灰 */
  readonly switching: boolean;
  /** 确认：把改动留在当前分支，切过去 */
  readonly onConfirmRequested: () => void;
  readonly onCloseRequested: () => void;
}

/**
 * 带着未提交改动切分支时的确认（GitHub Desktop 的「Switch branch」对话框，`stash-and-switch-branch-dialog.tsx`）。
 *
 * @remarks
 * GitHub Desktop 给两个去处：留在当前分支（stash）或带去新分支。这里只有前一个：未提交改动本来就按分支保存，
 * 切走再切回原样还在，正是「Leave my changes」的语义；「Bring my changes」库里没有，不给。
 * 外壳见 {@link WorkingTreeDialogShell}。
 */
export function WorkingTreeSwitchBranchDialog({
  activeBranch,
  dialog,
  onCloseRequested,
  onConfirmRequested,
  switching
}: WorkingTreeSwitchBranchDialogProps): React.JSX.Element | null {
  if (dialog === null) return null;

  return (
    <WorkingTreeDialogShell labelledBy='wt-switch-title' onCloseRequested={onCloseRequested} testId='wt-switch-dialog'>
      <div className='mb-4 flex items-center gap-2'>
        <GitBranch className='text-[var(--gd-accent)]' aria-hidden='true' size={18} />
        <h2 className='text-[15px] font-semibold' id='wt-switch-title'>
          Switch branch
        </h2>
      </div>

      <fieldset className='mb-4'>
        <legend className='mb-1.5 text-sm'>
          You have changes on this branch. What would you like to do with them?
        </legend>
        <label
          className='flex cursor-pointer items-start gap-3 rounded border px-3 py-2'
          style={{ background: 'var(--gd-selected)', borderColor: 'var(--gd-accent)' }}
          data-testid='wt-switch-leave-option'
        >
          <input
            className='radio radio-sm mt-0.5'
            defaultChecked
            data-testid='wt-switch-leave'
            name='wt-switch-action'
            type='radio'
          />
          <span>
            <span className='block text-sm font-medium'>Leave my changes on {activeBranch}</span>
            {/* 两行之间的空格要写出来：JSX 会删掉跨行的元素间空白，两行会在可读名里粘成一个词 */}{' '}
            <span className='mt-0.5 block text-xs' style={{ color: 'var(--gd-muted)' }}>
              Your in-progress work will stay on this branch for you to return to later
            </span>
          </span>
        </label>
      </fieldset>

      <div className='flex justify-end gap-2'>
        <button className='gd-btn-secondary' onClick={onCloseRequested} data-testid='wt-switch-cancel' type='button'>
          Cancel
        </button>
        <button
          className='gd-btn-primary'
          disabled={switching}
          onClick={onConfirmRequested}
          data-testid='wt-switch-confirm'
          type='button'
        >
          {switching ? 'Switching…' : 'Switch branch'}
        </button>
      </div>
    </WorkingTreeDialogShell>
  );
}
