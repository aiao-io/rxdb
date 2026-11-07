import { deterministicStringify, type RxDB } from '@aiao/rxdb';
import type { Subscription } from 'rxjs';
import type { BomViewCommands, BomViewHandle, BomViewInput, BomViewState } from './view-types.js';

const inputIdentity = (input: BomViewInput): string =>
  deterministicStringify(JSON.parse(JSON.stringify(input)) as unknown);

/** 三框架共享挂载、输入去重和命令委托；工厂由框架层传入，状态以回调交付。 */
export const createBomViewSession = (
  create: (db: RxDB, input: BomViewInput) => BomViewHandle,
  publish: (state: BomViewState) => void
) => {
  let active: BomViewHandle | null = null;
  let activeDb: RxDB | null = null;
  let appliedInput: string | null = null;
  let subscription: Subscription | null = null;

  const release = (): void => {
    subscription?.unsubscribe();
    active?.destroy();
    subscription = null;
    active = null;
    activeDb = null;
    appliedInput = null;
  };
  const current = (): BomViewHandle => {
    if (active === null) throw new Error('BOM 视图尚未挂载或已经卸载');
    return active;
  };
  const setInput = (input: BomViewInput): void => {
    current().setInput(input);
    appliedInput = inputIdentity(input);
  };
  const sync = (db: RxDB, input: BomViewInput): void => {
    if (active !== null && db === activeDb) {
      if (appliedInput !== inputIdentity(input)) setInput(input);
      return;
    }
    release();
    active = create(db, input);
    activeDb = db;
    appliedInput = inputIdentity(input);
    subscription = active.state$.subscribe(publish);
  };
  const commands: BomViewCommands = {
    setInput,
    refresh: () => current().refresh(),
    toggle: path => current().toggle(path),
    loadOccurrence: id => current().loadOccurrence(id),
    saveOccurrence: patch => current().saveOccurrence(patch),
    calculate: () => current().calculate()
  };
  return { sync, release, commands, inputIdentity };
};
