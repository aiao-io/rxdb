import { AdapterEncryptionFacade } from '@aiao/rxdb-adapter-sqlite-core';
import { RxDBAdapterSqlite } from '@aiao/rxdb-adapter-sqlite-wasm';
import { useI18n } from '@aiao/rxdb-i18n-react';
import { useRxDB } from '@aiao/rxdb-react';
import { EncryptedUser } from '@aiao/rxdb-test/encrypted';
import { Lock, LockOpen, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { firstValueFrom } from 'rxjs';
import { bindEncryptionFacade } from './encrypted-lifecycle';

export default function EncryptedPage(): React.JSX.Element {
  const rxdb = useRxDB();
  const { t } = useI18n();
  const encFacadeRef = useRef<AdapterEncryptionFacade | null>(null);

  const [isLocked, setIsLocked] = useState(true);
  const [users, setUsers] = useState<EncryptedUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isFirstTime, setIsFirstTime] = useState(false);

  const [passphrase, setPassphrase] = useState('');
  const [newName, setNewName] = useState('');
  const [newCard, setNewCard] = useState('');
  const [newSecret, setNewSecret] = useState('');

  const loadUsers = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const repo = rxdb.entityManager.getRepository(EncryptedUser);
      const result = await firstValueFrom(repo.findAll({ where: { combinator: 'and', rules: [] } }));
      setUsers(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, [rxdb]);

  useEffect(() => {
    const facadePromise = rxdb.getAdapter('sqlite-wasm').then((adapter: RxDBAdapterSqlite) => adapter.encryption);
    return bindEncryptionFacade(facadePromise, {
      onReady: facade => {
        encFacadeRef.current = facade;
        setIsLocked(facade.isLocked);
      },
      onInitialized: initialized => setIsFirstTime(!initialized),
      onLockChange: locked => {
        setIsLocked(locked);
        if (!locked) {
          void loadUsers();
        } else {
          setUsers([]);
        }
      },
      onError: err => setError(err instanceof Error ? err.message : String(err))
    });
  }, [rxdb, loadUsers]);

  const handleUnlock = async () => {
    if (!encFacadeRef.current || !passphrase.trim()) return;
    setError(null);
    try {
      await encFacadeRef.current.unlock({ passphrase });
      setIsFirstTime(false);
      setPassphrase('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleLock = () => {
    encFacadeRef.current?.lock();
  };

  const handleCreateUser = async () => {
    if (!newName.trim()) return;
    setError(null);
    try {
      const user = new EncryptedUser();
      user.name = newName.trim();
      user.creditCardInfo = newCard.trim() || null;
      user.apiSecret = newSecret.trim() || null;
      await user.save();
      setNewName('');
      setNewCard('');
      setNewSecret('');
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleRemoveUser = async (user: EncryptedUser) => {
    setError(null);
    try {
      await user.remove();
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className='container mx-auto max-w-3xl space-y-6 p-6'>
      {/* Header */}
      <div className='flex items-center gap-3'>
        {isLocked ?
          <Lock className={`text-error size-6`} />
        : <LockOpen className={`text-success size-6`} />}
        <h1 className='text-2xl font-bold'>{t('page.encrypted.title')}</h1>
        <span className={`badge ${isLocked ? 'badge-error' : 'badge-success'}`} data-testid='encryption-status'>
          {isLocked ? t('page.encrypted.locked') : t('page.encrypted.unlocked')}
        </span>
      </div>

      {/* Error */}
      {error && (
        <div role='alert' className='alert alert-error alert-soft'>
          <span>{error}</span>
        </div>
      )}

      {/* Unlock form */}
      {isLocked && (
        <div className='card card-border bg-base-100'>
          <div className='card-body space-y-4'>
            <h2 className='card-title text-lg'>{t('page.encrypted.unlockTitle')}</h2>
            {isFirstTime ?
              <div role='alert' className='alert alert-info alert-soft'>
                <span>{t('page.encrypted.firstUse')}</span>
              </div>
            : <p className='text-base-content/70 text-sm'>{t('page.encrypted.unlockHint')}</p>}
            <fieldset className='fieldset'>
              <legend className='fieldset-legend'>{t('page.encrypted.passphraseLabel')}</legend>
              <input
                type='password'
                className='input input-bordered w-full'
                placeholder={t('page.encrypted.passphrasePlaceholder')}
                value={passphrase}
                onChange={e => setPassphrase(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleUnlock()}
                data-testid='encryption-passphrase'
              />
            </fieldset>
            <div className='card-actions'>
              <button
                className='btn btn-primary'
                disabled={!passphrase.trim()}
                onClick={handleUnlock}
                data-testid='encryption-unlock'
              >
                <LockOpen className='size-4' />
                {t('page.encrypted.unlock')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Unlocked state */}
      {!isLocked && (
        <>
          {/* Toolbar */}
          <div className='flex items-center justify-between'>
            <button className='btn btn-sm btn-ghost' onClick={loadUsers}>
              <RefreshCw className={`size-4 ${isLoading ? 'animate-spin' : ''}`} />
              {t('page.encrypted.refresh')}
            </button>
            <button className='btn btn-sm btn-error btn-outline' onClick={handleLock} data-testid='encryption-lock'>
              <Lock className='size-4' />
              {t('page.encrypted.lock')}
            </button>
          </div>

          {/* Create new user */}
          <div className='card card-border bg-base-100'>
            <div className='card-body space-y-3'>
              <h2 className='card-title text-base'>{t('page.encrypted.createTitle')}</h2>
              <div className='grid grid-cols-1 gap-3 sm:grid-cols-3'>
                <fieldset className='fieldset'>
                  <legend className='fieldset-legend'>{t('page.encrypted.nameLabel')}</legend>
                  <input
                    type='text'
                    className='input input-bordered w-full'
                    placeholder='Alice'
                    value={newName}
                    onChange={e => setNewName(e.target.value)}
                    data-testid='encryption-name'
                  />
                </fieldset>
                <fieldset className='fieldset'>
                  <legend className='fieldset-legend'>{t('page.encrypted.cardLabel')}</legend>
                  <input
                    type='text'
                    className='input input-bordered w-full'
                    placeholder='4242 4242 4242 4242'
                    value={newCard}
                    onChange={e => setNewCard(e.target.value)}
                    data-testid='encryption-card'
                  />
                </fieldset>
                <fieldset className='fieldset'>
                  <legend className='fieldset-legend'>{t('page.encrypted.apiKeyLabel')}</legend>
                  <input
                    type='text'
                    className='input input-bordered w-full'
                    placeholder='sk_live_…'
                    value={newSecret}
                    onChange={e => setNewSecret(e.target.value)}
                    data-testid='encryption-secret'
                  />
                </fieldset>
              </div>
              <div className='card-actions'>
                <button
                  className='btn btn-primary btn-sm'
                  disabled={!newName.trim()}
                  onClick={handleCreateUser}
                  data-testid='encryption-save-user'
                >
                  <Plus className='size-4' />
                  {t('page.encrypted.saveUser')}
                </button>
              </div>
            </div>
          </div>

          {/* Users table */}
          {users.length > 0 ?
            <div className='overflow-x-auto'>
              <table className='table-zebra table-sm table'>
                <thead>
                  <tr>
                    <th>{t('page.encrypted.name')}</th>
                    <th>
                      {t('page.encrypted.card')} <span className='badge badge-warning badge-xs ml-1'>{t('page.encrypted.encryptedBadge')}</span>
                    </th>
                    <th>
                      {t('page.encrypted.apiKey')} <span className='badge badge-warning badge-xs ml-1'>{t('page.encrypted.encryptedBadge')}</span>
                    </th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(user => (
                    <tr key={user.id} data-testid='encryption-user-row'>
                      <td>{user.name}</td>
                      <td className='font-mono text-xs'>{user.creditCardInfo ?? '—'}</td>
                      <td className='font-mono text-xs'>{user.apiSecret ?? '—'}</td>
                      <td>
                        <button
                          className='btn btn-ghost btn-xs text-error'
                          onClick={() => handleRemoveUser(user)}
                          data-testid='encryption-delete-user'
                        >
                          <Trash2 className='size-3' />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          : <div className='text-base-content/50 py-10 text-center'>
              <p>{t('page.encrypted.empty')}</p>
            </div>
          }
        </>
      )}
    </div>
  );
}
