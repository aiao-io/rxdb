import { connectSupabase, RemoteSyncDatabase, resolveRemoteSync } from './supabase-sync';

describe('connectSupabase', () => {
  it('keeps local-only routes available when Supabase is not configured', async () => {
    const connect = vi.fn().mockResolvedValue({});
    const database = { connect } as unknown as RemoteSyncDatabase;

    await expect(connectSupabase(database, {})).resolves.toBe(false);
    expect(connect).not.toHaveBeenCalled();
  });

  it('fails fast when Supabase configuration is incomplete', async () => {
    const connect = vi.fn().mockResolvedValue({});
    const database = { connect } as unknown as RemoteSyncDatabase;

    await expect(connectSupabase(database, { VITE_SUPABASE_URL: 'https://example.supabase.co' })).rejects.toThrow(
      'VITE_SUPABASE_KEY'
    );
    expect(connect).not.toHaveBeenCalled();
  });

  it('connects the Supabase adapter when configuration is complete', async () => {
    const connect = vi.fn().mockResolvedValue({});
    const database = { connect } as unknown as RemoteSyncDatabase;

    await expect(
      connectSupabase(database, {
        VITE_SUPABASE_URL: 'https://example.supabase.co',
        VITE_SUPABASE_KEY: 'sb_publishable_example'
      })
    ).resolves.toBe(true);
    expect(connect).toHaveBeenCalledOnce();
    expect(connect).toHaveBeenCalledWith('supabase');
  });
});

describe('resolveRemoteSync', () => {
  /**
   * P1-2：resolver 算出来的 boolean 原先只落到 route data，没有任何页面读它 ——
   * 于是纯本地模式下 pull / push 按钮照样可点。
   * 这里把"算出来"和"写进可被 UI 绑定的状态"钉成同一次调用。
   */
  it('未配置远端时把状态标记为未连接', async () => {
    const connect = vi.fn().mockResolvedValue({});
    const database = { connect } as unknown as RemoteSyncDatabase;
    const markConnected = vi.fn();

    await expect(resolveRemoteSync(database, {}, { markConnected })).resolves.toBe(false);
    expect(markConnected).toHaveBeenCalledWith(false);
  });

  it('连上远端后把状态标记为已连接', async () => {
    const connect = vi.fn().mockResolvedValue({});
    const database = { connect } as unknown as RemoteSyncDatabase;
    const markConnected = vi.fn();

    await expect(
      resolveRemoteSync(
        database,
        { VITE_SUPABASE_URL: 'https://example.supabase.co', VITE_SUPABASE_KEY: 'sb_publishable_example' },
        { markConnected }
      )
    ).resolves.toBe(true);
    expect(markConnected).toHaveBeenCalledWith(true);
  });

  it('连接抛错时必须把状态标回未连接，而不是停在上一次的 true', async () => {
    const connect = vi.fn().mockRejectedValue(new Error('unreachable'));
    const database = { connect } as unknown as RemoteSyncDatabase;
    const markConnected = vi.fn();

    await expect(
      resolveRemoteSync(
        database,
        { VITE_SUPABASE_URL: 'https://example.supabase.co', VITE_SUPABASE_KEY: 'sb_publishable_example' },
        { markConnected }
      )
    ).rejects.toThrow('unreachable');
    expect(markConnected).toHaveBeenLastCalledWith(false);
  });
});
