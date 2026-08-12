# 字段加密适配器

`@aiao/rxdb-adapter-encrypted` 为 `@aiao/rxdb` 提供**字段级 AES-GCM-256 信封加密**，让指定字段在写入数据库文件、变更日志、查询缓存和历史快照时全程保持密文，不留明文痕迹。

> 加密在适配器层透明完成，上层 Repository API 无需改动。

## 安装

```bash npm2yarn
npm install @aiao/rxdb-adapter-encrypted
```

peer 依赖任意本地 SQLite 系适配器之一：`@aiao/rxdb-adapter-wa-sqlite`、`@aiao/rxdb-adapter-sqlite-wasm`、`@aiao/rxdb-adapter-pglite`、`@aiao/rxdb-adapter-sqliteai`。Supabase 等远端适配器不需要此包。

## 快速开始

### 1. 标注加密字段

在 `@Entity()` 的 `properties` 里给字段加 `encrypted: true`：

```typescript
import { Entity, EntityBase, PropertyType } from '@aiao/rxdb';

@Entity({
  name: 'User',
  tableName: 'users',
  properties: [
    { name: 'displayName', type: PropertyType.string },
    { name: 'email', type: PropertyType.string, encrypted: true },
    { name: 'phoneNumber', type: PropertyType.string, encrypted: true }
  ]
})
class User extends EntityBase {
  displayName!: string;
  email!: string;
  phoneNumber!: string;
}
```

> `id` 由 `EntityBase` 提供，不需要也不应该自己声明主键属性。

### 2. 初始化数据库并解锁密钥环

创建 `RxDB` 实例，注册适配器工厂，连接后调用 `adapter.encryption.unlock()` 才能读写加密字段：

```typescript
import { RxDB, SyncType } from '@aiao/rxdb';
import { RxDBAdapterWaSqlite } from '@aiao/rxdb-adapter-wa-sqlite';

const rxdb = new RxDB({
  dbName: 'app.db',
  context: { userId: 'current-user' },
  entities: [User],
  sync: {
    local: { adapter: 'wa-sqlite' },
    type: SyncType.None
  }
});

rxdb.adapter('wa-sqlite', async db => new RxDBAdapterWaSqlite(db, { vfs: 'OPFSAdaptiveVFS' }));

await rxdb.connect('wa-sqlite');

const adapter = await rxdb.getAdapter('wa-sqlite');

await adapter.encryption.unlock({
  passphrase: 'correct horse battery staple'
});

// 现在可以正常读写加密字段
await rxdb.entityManager.getRepository(User).create(
  new User({
    displayName: 'Ada',
    email: 'ada@example.com' // 写入时自动加密
  })
);
```

### 3. 读取时自动解密

```typescript
import { firstValueFrom } from 'rxjs';

const user = await firstValueFrom(
  User.findOne({
    where: {
      combinator: 'and',
      rules: [{ field: 'displayName', operator: '=', value: 'Ada' }]
    }
  })
);

console.log(user?.email); // 'ada@example.com'，读取时自动解密
```

## 解锁方式

`unlock()` 接受四种互斥的密钥来源：

```typescript
// 1. 口令（PBKDF2 派生密钥）
await adapter.encryption.unlock({ passphrase: 'my-passphrase' });

// 2. 原始密钥字节（32 字节 Uint8Array）
await adapter.encryption.unlock({ keyBytes: new Uint8Array(32) });

// 3. CryptoKey 对象
await adapter.encryption.unlock({ key: cryptoKey });

// 4. 异步密钥提供者（适合从 Keychain / HSM 获取）
await adapter.encryption.unlock({
  keyProvider: async () => fetchKeyFromSecureStorage()
});
```

### 空闲自动锁定

默认 5 分钟无操作后自动锁定，可通过 `idleTimeoutMs` 调整：

```typescript
await adapter.encryption.unlock({
  passphrase: 'my-passphrase',
  idleTimeoutMs: 10 * 60_000 // 10 分钟
  // idleTimeoutMs: 0          // 禁用自动锁定
});
```

锁定后读写加密字段会抛 `EncryptedLockedError`，调用 `unlock()` 重新解锁即可。

## 加密规格

| 项目     | 规格                                                |
| -------- | --------------------------------------------------- |
| 算法     | AES-GCM-256                                         |
| IV       | 每次写入生成唯一 96-bit IV                          |
| AAD      | `ns\|table\|column\|pk\|kid`（防止跨字段/跨行重放） |
| 信封格式 | `v\|alg\|kid\|iv\|ct\|tag`（6 段 base64url 文本）   |
| 存储类型 | 所有加密列在数据库中均以 `TEXT` 存储                |
| 口令派生 | PBKDF2，验证探针写入 DB，错误口令不保留密钥         |

## 约束

以下字段**不能**标注 `encrypted: true`：

- 主键（`primaryKey: true`）
- 外键 / 关联字段
- 索引字段（`index: true`）
- 唯一约束字段（`unique: true`）
- 可排序字段（`sortable: true`）
- FTS 全文搜索字段（`searchable: true`）
- 计算字段

违反约束时 `RxDB` 连接阶段会抛 `EncryptedConfigurationError`，fail-fast。

对加密字段执行 `where` / `order` / `group` / FTS 查询会抛 `EncryptedQueryError`（在 SQL 生成前拦截）。

## 错误类型

| 错误类                        | 触发场景                                  |
| ----------------------------- | ----------------------------------------- |
| `EncryptedConfigurationError` | schema 违反约束（PK/FK/index 等标注加密） |
| `EncryptedLockedError`        | 密钥环未解锁时读写加密字段                |
| `EncryptedDecryptError`       | 解密失败（数据损坏或密钥不匹配）          |
| `EncryptedUnlockError`        | 口令错误或密钥验证失败                    |
| `EncryptedQueryError`         | 对加密字段执行过滤/排序/FTS 查询          |

## MVP 范围外

当前版本不包含：

- 全库加密（仅声明字段被加密）
- 原生 Keychain / WebAuthn / Passkey 集成
- 可搜索加密（加密字段不支持查询）
- 密钥轮换（单 `kid`）
- 审计日志
- Tab 可见性变化自动重锁

## 参考

- [模型定义](../model-definition/README.md)
- [SQLite 适配器](./sqlite.md)
- [SQLite WASM 适配器](./sqlite-wasm.md)
