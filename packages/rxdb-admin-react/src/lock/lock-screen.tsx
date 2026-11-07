import { useEffect, useState, type FormEvent, type ReactElement } from 'react';
import { useAdminShell, useAdminStore, useAdminText } from '../context.js';
import { useModalDialog } from '../use-dialog.js';

function Clock(): ReactElement {
  const shell = useAdminShell();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  return <p className='admin-lock-clock'>{shell.formatDate(now, { timeStyle: 'medium' })}</p>;
}

function LockForm(): ReactElement {
  const shell = useAdminShell();
  const t = useAdminText();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<'wrong' | 'unavailable' | null>(null);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const hasPassword = shell.lock.hasPassword();

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    try {
      if (hasPassword) {
        if (!(await shell.lock.unlockWith(password))) setError('wrong');
      } else if (password !== '') {
        await shell.lock.setPassword(password);
      }
    } catch {
      setError('unavailable');
    }
  };

  return (
    <form className='admin-lock-card' onSubmit={event => void submit(event)}>
      <Clock />
      <p className='text-sm opacity-70'>{hasPassword ? t('lock.enterPassword') : t('lock.setPassword')}</p>
      <input
        type='password'
        className='input w-full'
        autoFocus
        autoComplete={hasPassword ? 'current-password' : 'new-password'}
        placeholder={t('lock.placeholder')}
        aria-label={t('lock.placeholder')}
        value={password}
        data-testid='admin-lock-input'
        onChange={event => {
          setPassword(event.target.value);
          setError(null);
        }}
      />
      {error && (
        <p role='alert' className='text-error text-sm' data-testid='admin-lock-error'>
          {error === 'wrong' ? t('lock.wrong') : t('lock.unavailable')}
        </p>
      )}
      <button type='submit' className='btn btn-primary w-full' data-testid='admin-lock-submit'>
        {hasPassword ? t('lock.unlock') : t('lock.set')}
      </button>
      {hasPassword &&
        (confirmingReset ?
          <div className='flex flex-col gap-2'>
            <p className='text-xs opacity-70'>{t('lock.forgotConfirm')}</p>
            <button
              type='button'
              className='btn btn-error btn-sm'
              data-testid='admin-lock-reset-apply'
              onClick={() => shell.lock.resetPassword()}
            >
              {t('lock.forgotApply')}
            </button>
          </div>
        : <button
            type='button'
            className='btn btn-ghost btn-sm'
            data-testid='admin-lock-forgot'
            onClick={() => setConfirmingReset(true)}
          >
            {t('lock.forgot')}
          </button>)}
    </form>
  );
}

/**
 * 锁屏：模态 `<dialog>` 遮住界面，Esc 不能关闭；未设置密码时先要求设置，忘记密码可重置（数据不受影响）。
 * @returns 锁屏元素；未锁定时 `<dialog>` 保持关闭。
 */
export function LockScreen(): ReactElement {
  const shell = useAdminShell();
  const t = useAdminText();
  const locked = useAdminStore(shell.lock.locked);
  const ref = useModalDialog(locked, () => undefined);
  return (
    <dialog
      ref={ref}
      className='admin-lock'
      aria-label={t('lock.title')}
      data-testid='admin-lock'
      onCancel={event => event.preventDefault()}
    >
      {locked && <LockForm />}
    </dialog>
  );
}
