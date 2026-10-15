/**
 * @fileoverview 捕获挂载点注册表（contracts/adapter-contract.md §1）的**转出口，不是第二份声明**。
 *
 * @remarks
 * 清单本身归核心：它随 `RxDBAdapterLocalBase` 的写原语变，而不是随捕获规则变——核心多一个写方法，
 * 就多一个必须被包住的挂载点，插件这侧一个字都不用改。核心的
 * {@link https://github.com/aiao-io/rxdb | `@aiao/rxdb`} 把它按 `keyof RawWritePrimitives` 键控，
 * 并且**装卸两侧真的遍历它**，所以「注册表少一行」与「有个写原语没被包住」在运行时是同一件事。
 *
 * 这里保留导出，是因为契约把挂载点表写成插件的对外说明（website 的 API 文档按插件包收录）：
 * 消费者仍然从 `@aiao/rxdb-plugin-working-tree` 读到这张表，只是它现在指向核心那一份。
 * 各写一遍的形态已经在 2026-09-23 撤掉——那时插件靠 `?raw` 读核心源码逐字比对形参名，
 * 漏改只会在测试里响，不会在类型或运行时响。
 */

export {
  WORKING_TREE_CAPTURE_MOUNT_POINTS,
  WORKING_TREE_CAPTURE_MOUNT_POINT_METHODS,
  isWorkingTreeCaptureMountPoint,
  type WorkingTreeCaptureMountPoint,
  type WorkingTreeCaptureMountPointOrdinal,
  type WorkingTreeWritePrimitiveSignature
} from '@aiao/rxdb';
