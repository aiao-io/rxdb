import type { DesktopAppManifests } from '../services/desktop-apps';
import {
  APPLICATIONS,
  bundleDirName,
  bundleInfoText,
  claimBundles,
  planProjection,
  readApplications,
  reconcileApplications,
  retireBundle
} from './application-projection';
import type { DiskStore } from './disk-store';

export const APPLICATION_JOURNAL_KEY = 'apps:pending-projection';

export interface ApplicationChangeRecord {
  readonly version: 1;
  readonly bundles: readonly { readonly dir: string; readonly appId: string }[];
}

export interface ApplicationJournal {
  read(): Promise<unknown>;
  write(record: ApplicationChangeRecord): Promise<void>;
  clear(): Promise<void>;
}

function changeRecord(raw: unknown): ApplicationChangeRecord {
  const record = raw as Partial<ApplicationChangeRecord> | null;
  if (!record || record.version !== 1 || !Array.isArray(record.bundles) || record.bundles.length > 256)
    throw new Error('The interrupted application operation record is invalid.');
  const valid = record.bundles.every(
    bundle =>
      bundle &&
      typeof bundle.dir === 'string' &&
      bundle.dir.length <= 255 &&
      bundle.dir.endsWith('.app') &&
      bundle.dir.length > 4 &&
      ![...bundle.dir].some(
        char => char === '/' || char === '\\' || char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127
      ) &&
      typeof bundle.appId === 'string' &&
      /^catalog:[a-z][a-z0-9-]{0,63}$/.test(bundle.appId)
  );
  if (!valid || new Set(record.bundles.map(bundle => bundle.dir)).size !== record.bundles.length)
    throw new Error('The interrupted application operation record has invalid targets.');
  return record as ApplicationChangeRecord;
}

/** 持有磁盘锁；先拒绝占位冲突，再记录本次可能改变的可选应用包。 */
export async function prepareApplicationChange(
  store: DiskStore,
  journal: ApplicationJournal,
  before: DesktopAppManifests,
  after: DesktopAppManifests
): Promise<void> {
  if ((await journal.read()) !== null) throw new Error('A previous application operation still needs recovery.');
  const { entries, facts } = await readApplications(store);
  const plan = planProjection(after, entries, facts);
  const conflict = plan.conflicts.find(item => item.appId.startsWith('catalog:'));
  if (conflict)
    throw new Error(`“${conflict.dir}” already exists in Applications. Move or rename that item before installing.`);
  const bundles = new Map(
    claimBundles(before, facts)
      .filter(bundle => bundle.appId.startsWith('catalog:'))
      .map(bundle => [bundle.dir, bundle.appId])
  );
  for (const app of Object.values(after))
    if (app.kind === 'web' && app.installScope === 'approved-catalog') bundles.set(bundleDirName(app), app.id);
  if (bundles.size) await journal.write({ version: 1, bundles: [...bundles].map(([dir, appId]) => ({ dir, appId })) });
}

/** 按已提交的安装集恢复系统元数据；退役只删生成的文件，用户放进包里的内容仍保留。 */
export async function recoverApplicationChange(
  store: DiskStore,
  journal: ApplicationJournal,
  manifests: DesktopAppManifests
): Promise<boolean> {
  const raw = await journal.read();
  if (raw === null) return false;
  const record = changeRecord(raw);
  for (const bundle of record.bundles) {
    const app = Object.values(manifests).find(app => app.id === bundle.appId);
    if (app?.kind !== 'web' || app.installScope !== 'approved-catalog' || bundleDirName(app) !== bundle.dir) {
      await retireBundle(store, bundle.dir);
      continue;
    }
    const contents = [...APPLICATIONS, bundle.dir, 'Contents'];
    await store.write([...contents, 'Info.plist'], new TextEncoder().encode(bundleInfoText(app)));
    await store.write([...contents, 'PkgInfo'], new TextEncoder().encode('APPL????'));
  }
  await reconcileApplications(store, manifests);
  await journal.clear();
  return true;
}
