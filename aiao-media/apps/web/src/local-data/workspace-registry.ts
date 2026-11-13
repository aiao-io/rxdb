export interface WorkspaceAccount {
  projectOrigin: string;
  userId: string;
}
export interface WorkspaceBinding {
  version: 1;
  state: 'pending' | 'active' | 'paused';
  requestId: string;
  remoteWorkspaceId: string | null;
  mode: 'create' | 'join';
  initialized: boolean;
}
export interface WorkspaceProfile {
  id: string;
  account: WorkspaceAccount | null;
  binding: WorkspaceBinding | null;
}
export interface WorkspaceRegistryState {
  version: 1;
  generation: number;
  selectedId: string;
  profiles: WorkspaceProfile[];
}
export interface WorkspaceRegistryPort {
  read(): Promise<{ payload: string; revision: number } | null>;
  write(payload: string, revision: number | null): Promise<void>;
  exclusive<T>(operation: () => Promise<T>): Promise<T>;
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const sameAccount = (a: WorkspaceAccount | null, b: WorkspaceAccount | null): boolean =>
  a !== null && b !== null && a.userId === b.userId && a.projectOrigin === b.projectOrigin;

function account(value: WorkspaceAccount): WorkspaceAccount {
  const url = new URL(value.projectOrigin);
  if (
    !uuid.test(value.userId) ||
    url.origin !== value.projectOrigin ||
    !(
      url.protocol === 'https:' ||
      (url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname))
    )
  )
    throw new Error('工作区账号身份无效。');
  return { projectOrigin: url.origin, userId: value.userId.toLowerCase() };
}

function validate(value: unknown): WorkspaceRegistryState {
  const state = value as WorkspaceRegistryState;
  if (
    !state ||
    state.version !== 1 ||
    !Number.isSafeInteger(state.generation) ||
    state.generation < 0 ||
    !Array.isArray(state.profiles) ||
    state.profiles.length < 1 ||
    state.profiles.length > 1000 ||
    !uuid.test(state.selectedId)
  )
    throw new Error('本机工作区注册表不可读；原数据保留。');
  const ids = new Set<string>();
  for (const profile of state.profiles) {
    if (!profile || !uuid.test(profile.id) || ids.has(profile.id)) throw new Error('工作区标识重复或无效。');
    ids.add(profile.id);
    if (profile.account !== null) account(profile.account);
    if (
      profile.binding !== null &&
      (!profile.account ||
        profile.binding.version !== 1 ||
        !['pending', 'active', 'paused'].includes(profile.binding.state) ||
        !['create', 'join'].includes(profile.binding.mode) ||
        typeof profile.binding.initialized !== 'boolean' ||
        !uuid.test(profile.binding.requestId) ||
        (profile.binding.remoteWorkspaceId !== null && !uuid.test(profile.binding.remoteWorkspaceId)) ||
        ((profile.binding.state === 'active' || profile.binding.initialized) && !profile.binding.remoteWorkspaceId))
    )
      throw new Error('绑定记录无效。');
  }
  if (!ids.has(state.selectedId)) throw new Error('当前工作区未注册。');
  return state;
}

/** 持久管理本机账号副本；登录本身不会绑定或上传未绑定的数据。 */
export class WorkspaceRegistry {
  constructor(
    private readonly initialProfileId: string,
    private readonly port: WorkspaceRegistryPort,
    private readonly createId: () => string = () => crypto.randomUUID()
  ) {
    if (!uuid.test(initialProfileId)) throw new Error('本机工作区标识无效。');
  }

  async read(): Promise<WorkspaceRegistryState> {
    const row = await this.port.read();
    return this.decode(row);
  }

  selectAccount(identity: WorkspaceAccount | null): Promise<WorkspaceRegistryState> {
    const target = identity ? account(identity) : null;
    return this.mutate(state => {
      const current = this.selected(state);
      if (current.binding && !sameAccount(current.account, target)) current.binding.state = 'paused';
      if (!target) return state;
      const known =
        state.profiles.filter(profile => sameAccount(profile.account, target) && profile.binding).at(-1) ??
        state.profiles.filter(profile => sameAccount(profile.account, target)).at(-1);
      if (known) state.selectedId = known.id;
      else if (current.account) {
        const profile: WorkspaceProfile = { id: this.createId(), account: target, binding: null };
        state.profiles.push(profile);
        state.selectedId = profile.id;
      }
      return state;
    });
  }

  prepareBinding(identity: WorkspaceAccount, newCopy = false): Promise<WorkspaceBinding> {
    const target = account(identity);
    return this.mutate(state => {
      let profile = this.selected(state);
      if (profile.account && !sameAccount(profile.account, target)) throw new Error('账号已切换，绑定未执行。');
      if (newCopy && (!profile.binding || (profile.binding.mode === 'create' && !profile.binding.initialized))) {
        if (profile.binding) {
          profile.account = null;
          profile.binding = null;
        }
        profile = { id: this.createId(), account: null, binding: null };
        state.profiles.push(profile);
        state.selectedId = profile.id;
      }
      profile.account = target;
      profile.binding ??= {
        version: 1,
        state: 'pending',
        requestId: this.createId(),
        remoteWorkspaceId: null,
        mode: newCopy ? 'join' : 'create',
        initialized: false
      };
      if (profile.binding.state === 'paused') profile.binding.state = 'pending';
      return profile.binding;
    });
  }

  recordRemote(identity: WorkspaceAccount, requestId: string, remoteWorkspaceId: string): Promise<void> {
    const target = account(identity);
    if (!uuid.test(remoteWorkspaceId)) return Promise.reject(new Error('远程工作区标识无效。'));
    return this.mutate(state => {
      const profile = this.selected(state);
      if (
        !sameAccount(profile.account, target) ||
        profile.binding?.requestId !== requestId ||
        profile.binding.state === 'paused'
      )
        throw new Error('绑定已变化，未确认此回执。');
      if (profile.binding.remoteWorkspaceId && profile.binding.remoteWorkspaceId !== remoteWorkspaceId)
        throw new Error('工作区回执不一致。');
      profile.binding.remoteWorkspaceId = remoteWorkspaceId;
    });
  }

  activateBinding(identity: WorkspaceAccount, requestId: string, remoteWorkspaceId: string): Promise<void> {
    const target = account(identity);
    if (!uuid.test(remoteWorkspaceId)) return Promise.reject(new Error('远程工作区回执无效。'));
    return this.mutate(state => {
      const profile = this.selected(state);
      if (
        !sameAccount(profile.account, target) ||
        profile.binding?.requestId !== requestId ||
        profile.binding.state === 'paused'
      )
        throw new Error('绑定回执已过期，未写入当前工作区。');
      if (profile.binding.remoteWorkspaceId && profile.binding.remoteWorkspaceId !== remoteWorkspaceId)
        throw new Error('远程工作区标识不匹配。');
      profile.binding.remoteWorkspaceId = remoteWorkspaceId;
      profile.binding.state = 'active';
      profile.binding.initialized = true;
    });
  }

  selectProfile(id: string, generation: number): Promise<void> {
    return this.mutate(state => {
      if (state.generation !== generation || !state.profiles.some(profile => profile.id === id))
        throw new Error('工作区选择已变化。');
      const current = this.selected(state);
      if (current.id !== id && current.binding) current.binding.state = 'paused';
      state.selectedId = id;
    });
  }

  private selected(state: WorkspaceRegistryState): WorkspaceProfile {
    const profile = state.profiles.find(item => item.id === state.selectedId);
    if (!profile) throw new Error('当前工作区未注册。');
    return profile;
  }

  private decode(row: { payload: string } | null): WorkspaceRegistryState {
    return row ?
        validate(JSON.parse(row.payload))
      : {
          version: 1,
          generation: 0,
          selectedId: this.initialProfileId,
          profiles: [{ id: this.initialProfileId, account: null, binding: null }]
        };
  }

  private mutate<T>(operation: (state: WorkspaceRegistryState) => T): Promise<T> {
    return this.port.exclusive(async () => {
      const row = await this.port.read();
      const state = this.decode(row);
      const before = JSON.stringify(state);
      const result = operation(state);
      if (JSON.stringify(state) !== before) {
        state.generation++;
        await this.port.write(JSON.stringify(validate(state)), row?.revision ?? null);
      }
      return structuredClone(result);
    });
  }
}
