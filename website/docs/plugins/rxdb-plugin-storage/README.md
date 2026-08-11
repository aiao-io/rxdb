# @aiao/rxdb-plugin-storage

`@aiao/rxdb-plugin-storage` 提供了在浏览器中管理文件的能力，使用 [OPFS (Origin Private File System)](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system) 存储文件内容，配合 RxDB 管理文件元数据（名称、大小、类型、路径等）。

## 安装

```bash npm2yarn
npm install @aiao/rxdb @aiao/rxdb-plugin-storage
```

## 核心概念

### 文件存储层

- **OPFS**: 存储文件二进制内容，高性能本地读写，完全私有，不暴露给用户
- **RxDB (`StorageFileMeta`)**: 存储文件元数据，支持响应式查询和变更追踪

### 插件接口

Storage 插件实现 `IRxDBPlugin` 接口，通过 `rxdb.use()` 注册，安装后 `rxdb.storage` 即可用。

## 基础使用

### 注册插件

```typescript
import { RxDB, SyncType } from '@aiao/rxdb';
import { rxdbStorage } from '@aiao/rxdb-plugin-storage';

const rxdb = new RxDB({
  dbName: 'myapp',
  entities: [Todo],
  sync: { local: { adapter: 'wa-sqlite' }, type: SyncType.None }
});

rxdb.use(rxdbStorage());
await rxdb.connect('wa-sqlite');
await rxdb.storage.init();
```

### 配置选项

```typescript
rxdb.use(
  rxdbStorage({
    rootDir: 'uploads', // OPFS 根目录，默认 'files'
    previewLimitBytes: 10 * 1024 * 1024 // 预览文件大小限制，默认 50MB
  })
);
```

## API

### 上传文件

```typescript
const file = new File(['Hello World'], 'hello.txt', { type: 'text/plain' });

// 上传到根目录
const meta = await rxdb.storage.upload(file);

// 上传到指定目录
const meta = await rxdb.storage.upload(file, { path: 'documents' });

// 覆盖已存在的文件
const meta = await rxdb.storage.upload(file, { overwrite: true });
```

### 读取文件

```typescript
// 返回 Blob
const blob = await rxdb.storage.read(meta.id);
```

### 下载文件

```typescript
// 触发浏览器下载（优先使用 showSaveFilePicker，回退到 <a> 标签）
await rxdb.storage.download(meta.id);

// 指定下载文件名
await rxdb.storage.download(meta.id, { suggestedName: 'custom-name.txt' });
```

### 预览文件

```typescript
// 创建预览（返回临时 Object URL，含 dispose 方法）
const preview = await rxdb.storage.preview(meta.id);
console.log(preview.url); // blob:http://...
console.log(preview.type); // 'text/plain'

// 使用后释放
preview.dispose();
```

### Object URL 管理

```typescript
// 手动创建 Object URL
const url = await rxdb.storage.createObjectUrl(meta.id);

// 使用后手动释放
rxdb.storage.revokeObjectUrl(url);
```

### 列出文件

```typescript
// 获取所有文件元数据
const files = await rxdb.storage.list();

// 列出指定目录下的文件（不含子目录）
const files = await rxdb.storage.list({ path: '/documents' });
```

### 浏览目录条目

```typescript
// 列出目录内的文件和子目录（树状浏览）
const entries = await rxdb.storage.listEntries({ path: '/' });

for (const entry of entries) {
  if (entry.kind === 'directory') {
    console.log('目录:', entry.name, entry.path);
  } else {
    console.log('文件:', entry.name, entry.meta.size);
  }
}
```

### 创建目录

```typescript
const dirPath = await rxdb.storage.createDirectory('images');
const nested = await rxdb.storage.createDirectory('2024', { path: '/images' });
```

### 重命名

```typescript
// 重命名文件
const updated = await rxdb.storage.rename(meta.id, 'new-name.txt');

// 重命名目录
const newPath = await rxdb.storage.renameDirectory('/images', 'photos');
```

### 删除文件

```typescript
await rxdb.storage.delete(meta.id);
```

### 清空存储

```typescript
// 清空所有文件
await rxdb.storage.clear();

// 清空指定目录下的所有文件
await rxdb.storage.clear('/documents');
```

### 获取元数据

```typescript
const meta = await rxdb.storage.getMeta(fileId);
console.log(meta?.name, meta?.size, meta?.mimeType, meta?.opfsPath);
```

### 响应式监听

```typescript
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

rxdb.storage
  .watch(fileId)
  .pipe(takeUntilDestroyed())
  .subscribe(meta => {
    if (meta) {
      console.log('文件更新:', meta.name, meta.size);
    } else {
      console.log('文件已删除');
    }
  });
```

## StorageFileMeta 实体

文件元数据保存在 `StorageFileMeta` 实体中，字段如下：

| 字段             | 类型    | 说明                          |
| :--------------- | :------ | :---------------------------- |
| `id`             | string  | 实体主键（继承自 EntityBase） |
| `name`           | string  | 文件名                        |
| `mimeType`       | string  | MIME 类型                     |
| `size`           | number  | 文件字节大小                  |
| `opfsPath`       | string  | OPFS 内相对路径（唯一索引）   |
| `contentVersion` | integer | 内容版本号，每次写入+1        |

## 路径规范

- 路径分隔符统一为 `/`
- 目录路径格式：`/documents/2024`
- 文件路径格式：`documents/2024/report.pdf`（相对路径，无前导 `/`）
- 根目录：`/`

## 框架集成示例

### Angular

```typescript
import { inject } from '@angular/core';
import { RXDB } from '@aiao/rxdb-angular';
import { toSignal } from '@angular/core/rxjs-interop';

@Component({
  template: `
    <input (change)="upload($event)" type="file" />
    <p>文件名: {{ meta()?.name }}</p>
  `
})
export class FileUploadComponent {
  private rxdb = inject(RXDB);
  meta = toSignal(this.rxdb.storage.watch(this.fileId));

  async upload(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) {
      await this.rxdb.storage.upload(file, { path: 'uploads' });
    }
  }
}
```

### React

```tsx
import { useRxdb } from '@aiao/rxdb-react';
import { useState } from 'react';

function FileUpload() {
  const rxdb = useRxdb();
  const [meta, setMeta] = useState(null);

  const upload = async event => {
    const file = event.target.files?.[0];
    if (file) {
      const result = await rxdb.storage.upload(file, { path: 'uploads' });
      setMeta(result);
    }
  };

  return (
    <div>
      <input type="file" onChange={upload} />
      {meta && <p>文件名: {meta.name}</p>}
    </div>
  );
}
```

### Vue

```vue
<script setup>
import { useRxdb } from '@aiao/rxdb-vue';
import { ref } from 'vue';

const rxdb = useRxdb();
const meta = ref(null);

const upload = async event => {
  const file = event.target.files?.[0];
  if (file) {
    meta.value = await rxdb.storage.upload(file, { path: 'uploads' });
  }
};
</script>

<template>
  <input @change="upload" type="file" />
  <p v-if="meta">文件名: {{ meta.name }}</p>
</template>
```

## 注意事项

- **必须先连接本地适配器**：Storage 插件依赖 `rxdb.config.sync.local` 适配器（SQLite 或 PGlite），确保先调用 `rxdb.connect()`
- **必须调用 `init()`**：插件注册后需显式调用 `rxdb.storage.init()`，`install()` 方法不可 `await`
- **OPFS 浏览器兼容性**：Chrome 86+、Safari 15.2+、Firefox 111+ 支持 OPFS；OPFS 数据仅在同源下可访问
- **Object URL 需要手动释放**：`createObjectUrl()` 返回的 URL 使用后需调用 `revokeObjectUrl()` 释放内存；`preview()` 返回的对象提供 `dispose()` 方法
- **预览大小限制**：默认 50MB，超出会抛出错误，可通过 `previewLimitBytes` 选项调整
- **元数据同步策略**：`StorageFileMeta` 实体自动被设置为 `SyncType.None`（本地专属），不会同步到远端
