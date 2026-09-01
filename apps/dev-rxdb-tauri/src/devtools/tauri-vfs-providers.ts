import type { DevToolsProviderDescriptor, DevToolsUnavailableReason } from '@aiao/rxdb-devtools';
import { DEVTOOLS_BROWSER_OPFS_MAX_TRANSFER_BYTES, DEVTOOLS_PROVIDER_OPERATIONS } from '@aiao/rxdb-devtools';
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
