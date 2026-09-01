import type { ConnectorProviderPorts, DevToolsProviderDescriptor, DevToolsUnavailableReason } from '@aiao/rxdb-devtools';
import {
  createDevToolsReadOnlySettingsProvider,
  DEVTOOLS_BROWSER_OPFS_MAX_TRANSFER_BYTES,
  DEVTOOLS_PROVIDER_OPERATIONS
} from '@aiao/rxdb-devtools';
import type { WaSqliteBackend } from '../app/wa-sqlite-backend';

/**
 * US-905 AC#6：把 wa-sqlite demo **运行时真实选中**的 VFS 映射成三领域的 provider descriptor。
 *
 * @remarks
 * 这是「语义 kind，不是平台分支」的落点。三个 runtime 上同一份 kind 跑同一份 conformance，
 * 所以本模块**只**按 {@link WaSqliteBackend} 决定 kind，`runtime: 'tauri'` 只进 descriptor 的
 * 显示字段、不参与任何行为判定。绝不能反过来——按 adapter 名、URL 或平台去猜 OPFS：
 * 浏览器预览那份（`setup_rxdb_wa-sqlite.ts`）和打包后的 Tauri 窗口都跑 wa-sqlite，
 * 但只有前者落在 OPFS 上，猜出来的结论会在某一端静默少声明一个能力。
 *
 * 三种后端的语义（与 US-904 能力矩阵一致）：
 *
 * - `OPFSCoopSyncVFS`：数据库落在 OPFS，文件与 Settings 都是 `opfs` kind；
 * - `IDBBatchAtomicVFS`：数据库仍可开（`rxdb`），但文件系统暴露不了 OPFS 入口（`files: unavailable`），
 *   Settings 落在 IndexedDB（`settings: idb`）；
 * - `unavailable`：两个能力都缺，本地库开不起来，三领域全部结构化 `unavailable`，不创建任何 fallback。
 *
 * @module apps/dev-rxdb-tauri/devtools/tauri-vfs-providers
 */

/** 三个领域的 descriptor；每领域最多一份。 */
export interface TauriVfsProviderDescriptors {
  readonly database: DevToolsProviderDescriptor;
  readonly files: DevToolsProviderDescriptor;
  readonly settings: DevToolsProviderDescriptor;
}

/** OPFS files 的单次传输上限，与浏览器 `opfs` kind 同一取值。 */
const OPFS_MAX_TRANSFER_BYTES = DEVTOOLS_BROWSER_OPFS_MAX_TRANSFER_BYTES;

/** wa-sqlite 跑不起来时三领域共用的结构化 reason。 */
const UNAVAILABLE_REASON: DevToolsUnavailableReason = 'runtime_unsupported';

/**
 * 建一份 `kind: 'unavailable'` 的 descriptor：无操作、带结构化 reason、零传输上限。
 *
 * @remarks
 * `unavailable` operations 必须为空且带共享 reason code——这是 descriptor guard 的硬约束，
 * 空操作在这里是「本运行时有但此刻用不了」的结构化表达，不是「忘了填」。
 */
function unavailableDescriptor(domain: DevToolsProviderDescriptor['domain']): DevToolsProviderDescriptor {
  return {
    domain,
    version: 1,
    kind: 'unavailable',
    operations: [],
    runtime: 'tauri',
    limits: { maxTransferBytes: 0 },
    reason: UNAVAILABLE_REASON
  };
}

/**
 * 由 wa-sqlite 真实选中的后端，产出三领域的 provider descriptor。
 *
 * @param backend - `selectWaSqliteBackend` 的返回值，不是任何平台的推断结果
 * @returns 三领域的 descriptor；`database` 仅在 `unavailable` 时不可用
 */
export function mapWaSqliteBackendToProviders(backend: WaSqliteBackend): TauriVfsProviderDescriptors {
  switch (backend) {
    case 'OPFSCoopSyncVFS':
      return {
        database: {
          domain: 'database',
          version: 1,
          kind: 'rxdb',
          operations: DEVTOOLS_PROVIDER_OPERATIONS.database,
          runtime: 'tauri',
          limits: { maxTransferBytes: 0 }
        },
        files: {
          domain: 'files',
          version: 1,
          kind: 'opfs',
          operations: ['list', 'download', 'upload', 'create-directory', 'delete'],
          runtime: 'tauri',
          limits: { maxTransferBytes: OPFS_MAX_TRANSFER_BYTES }
        },
        settings: {
          domain: 'settings',
          version: 1,
          kind: 'opfs',
          operations: ['export'],
          runtime: 'tauri',
          limits: { maxTransferBytes: 0 }
        }
      };

    case 'IDBBatchAtomicVFS':
      return {
        database: {
          domain: 'database',
          version: 1,
          kind: 'rxdb',
          operations: DEVTOOLS_PROVIDER_OPERATIONS.database,
          runtime: 'tauri',
          limits: { maxTransferBytes: 0 }
        },
        // IDB 后端暴露不出 OPFS 文件入口，文件页因此结构化 unavailable。
        files: unavailableDescriptor('files'),
        settings: {
          domain: 'settings',
          version: 1,
          kind: 'idb',
          operations: ['export'],
          runtime: 'tauri',
          limits: { maxTransferBytes: 0 }
        }
      };

    case 'unavailable':
      return {
        database: unavailableDescriptor('database'),
        files: unavailableDescriptor('files'),
        settings: unavailableDescriptor('settings')
      };
  }
}

/**
 * 把上面那份映射装配成页内 connector 的 provider 端口。
 *
 * @remarks
 * 这是映射唯一的**运行时**调用点——没有它，`mapWaSqliteBackendToProviders()` 就只是一份
 * 被 spec 验证过、却决定不了任何声明的表。
 *
 * 装配层的模型是「没接上的领域不宣告 descriptor」，表达不了 `kind: 'unavailable'`。
 * 两者在这里不冲突，因为映射里的 `unavailable` 各自有归宿：
 *
 * - `files: unavailable`（IDB 后端）→ 撤掉 `getRootDirectory`，该领域整个不宣告。
 *   留着入口会让文件页照常点亮，再逐个操作失败——这正是 descriptor 模型要避免的。
 * - 后端整体 `unavailable` → 返回 `undefined`，压根不建 connector。这条路上
 *   `setup_rxdb_wa-sqlite.ts` 本来就会先抛错，本地库开不起来时没有可调试的对象。
 *
 * `settings` 整份注入：装配层的缺省是浏览器 `kind: opfs / runtime: browser`，
 * 而这里要的是映射按真实 VFS 得出的 `opfs | idb` 配 `runtime: tauri`。
 *
 * @param backend - `selectWaSqliteBackend` 的返回值
 * @param opfsRoot - 本页的 OPFS 根目录入口（`resolveBrowserOpfsRoot()`）；页面没有 OPFS 时为 `undefined`
 * @returns 可直接交给 `getDevToolsConnector({ providers })` 的端口；后端不可用时 `undefined`
 */
export function createWaSqliteDevToolsPorts(
  backend: WaSqliteBackend,
  opfsRoot: (() => Promise<FileSystemDirectoryHandle>) | undefined
): ConnectorProviderPorts | undefined {
  if (backend === 'unavailable') return undefined;

  const descriptors = mapWaSqliteBackendToProviders(backend);
  return {
    runtime: 'tauri',
    settings: createDevToolsReadOnlySettingsProvider(descriptors.settings),
    // 后端说 files 可用、页面却拿不到根目录时同样不宣告：假入口比缺声明更难查。
    getRootDirectory: descriptors.files.kind === 'opfs' ? opfsRoot : undefined
  };
}
