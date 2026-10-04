---
id: RV-044
title: 桌面路径别名导致两个元数据记录共享文件并覆盖原内容
status: Open
created: 2026-10-04
updated: 2026-10-04
severity: P1
baseline: b01e35e9aedc58e61fb02a909ec98b4a119e82a2
---

# RV-044：桌面路径别名导致两个元数据记录共享文件并覆盖原内容

## 问题

🔴 **确认数据覆盖问题，待修复。** 在本机原生卷上，大小写不同或 Unicode 规范等价的两个逻辑路径指向同一个文件。第二个路径 `upload(..., {overwrite:true})` 成功后，SQLite 里是两条不同 ID 的 metadata，磁盘却只有一个文件；通过第一个 ID 再读也得到第二次上传的内容。

例如 `a.txt` / `A.txt`，以及 `café.txt` 的 U+00E9 / `café.txt` 的 U+0065 U+0301。普通 `alpha.txt` / `beta.txt` 对照正常。

## 根因与源码证据

- [encodePhysicalName](../../packages/rxdb-plugin-storage/src/filesystem/physical-name.ts) 第 69–95 行只转义非法字符/设备名/结尾点空格，安全 ASCII、大小写和普通 Unicode 原样保留。JavaScript 字符串不同不等于宿主文件系统能区分这些名称。
- [desktop physical path](../../packages/rxdb-plugin-storage/src/desktop.ts) 的分段映射和 filePath 使用该编码，未建立与原生卷比较规则相容的身份。
- [uploadLocked](../../packages/rxdb-plugin-storage/src/storage.ops.ts) 第 241–275 行按精确逻辑 opfsPath 查 metadata。第二个别名查不到原 metadata，但能找到同一个物理文件；overwrite=true 绕过冲突，写掉旧文件后又 createMeta，而不是保持同一文件身份。
- [PathLockManager](../../packages/rxdb-plugin-storage/src/path-lock.ts) 的锁名也按原逻辑字符串生成，两个别名不是同一锁。并发别名写尚未单独动态复验，不能把顺序覆盖扩写成已测出的并发损坏。

[Electron file host](../../packages/rxdb-adapter-electron/src/electron-file-host.ts) 的 containedPath 保证根内路径/符号链接边界，但返回词法路径；它没有替 storage 的逻辑 namespace 解决这些别名。**不是路径越界或 RCE，主要根因属于 storage 的逻辑/物理身份映射。**

## 全原生复验

[复验 spec](../../packages/rxdb-plugin-storage/src/__tests__/review-desktop-path-alias.spec.ts) 使用实际 RxDB、RxDBAdapterElectron、node:sqlite 数据库、实际 Electron SQLite/file host 和本机真实磁盘。传输层直接转交真实 host，不使用 fake metadata repository 或 fake filesystem；每例只操作自己新建的临时目录，完成后销毁并删除。

**2 failed / 1 passed**：[日志](evidence/2026-10-04/storage-native-path-alias.txt)、[状态](evidence/2026-10-04/storage-native-path-alias-status.json)。两种别名都得到 metadataRows=2、diskNames.length=1，firstBytes 和 secondBytes 都是 `second-replacement`，原 `first-original` 已被替换；不同普通名称对照保留两个内容和两个文件。

```bash
CI=true CODECOV_TOKEN= NX_DAEMON=false pnpm nx run rxdb-plugin-storage:test --args='src/__tests__/review-desktop-path-alias.spec.ts --run --coverage.enabled=false --maxWorkers=1' --excludeTaskDependencies --skipRemoteCache --skipNxCache
```

这是当前 macOS 27 本机卷的实测，不假设所有卷都不区分大小写，也未运行 Windows/Linux、Rust/Tauri host 或 Electron GUI/IPC。case-sensitive 卷可能不会在此用例失败；本轮平台能力在真实文件读写中已经观察到，不能仅凭操作系统名称推断。

P1 来自已成功接受的第二次操作覆盖另一 metadata ID 对应的内容，造成真实文件/数据库不一致；不是单纯命名风格差异。

## 修复方案

先阻断把物理别名当成独立逻辑目标的写入：同一原生对象的替换必须匹配既有身份、或明确拒绝不可区分的另一个逻辑名，不能一份文件挂两个 metadata ID。按规范物理身份仲裁锁，并补文件与目录的 case/Unicode 别名场景。

若要继续支持 OPFS 上可并存的全部逻辑名称，设计对宿主大小写/Unicode 比较规则也单射的版本化物理编码。旧目录已采用当前编码，不能直接换编码让既有文件“消失”；须有显式版本与迁移/冲突核查，不添加无声的旧名读取 fallback。不能全局把用户的逻辑名转小写或 NFC 后忽略已有同名记录。

补大小写/NFC-NFD 文件、目录、rename/copy、overwrite 拒绝/成功、同一别名并发与迁移兼容；损坏数据的恢复能力另行确认，不声称修映射就能找回已覆盖的原内容。

## 解决记录

- [x] 真实 SQLite + 文件 host + 磁盘复验及正常命名对照保留；业务实现未修改。
- [ ] 阻断别名写入并明确版本化映射/迁移方案。
- [ ] 其它卷/OS/宿主及并发补证；当前仍 Open。
