# 客户端生成

基于实体模型自动生成类型安全的客户端代码，包括实体类型、查询/变更 API 和关系字段规则，减少重复劳动并降低前后端偏差。

## 这页解决什么

- 读取 `@aiao/rxdb` 装饰器定义（`@Entity` / `@TreeEntity` / `@GraphEntity`）
- 生成实体类型与静态类型映射
- 生成 `Repository` 查询方法签名（`get/find/findAll/findByCursor/...`）
- 生成关系字段的规则类型，支持点语法关系查询
- 可配置关系查询深度，默认 3 层

## 安装

```bash npm2yarn
npm i -D @aiao/rxdb-client-generator
```

## 用法一：命令行

1. 新建配置文件 `rxdb.config.ts`

```ts
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default [
  {
    entities: [path.join(__dirname, 'entities', '*.ts')], // 支持 glob
    outDir: path.join(__dirname, 'dist', 'entities'),
    relationQueryDeep: 3
  }
];
```

1. 运行生成器

```bash
# node / bun / pnpm script 均可
node node_modules/@aiao/rxdb-client-generator/dist/cli.js ./rxdb.config.ts

# 或直接使用包内 CLI（已暴露 shebang）
npx @aiao/rxdb-client-generator ./rxdb.config.ts
```

参考示例：`packages/rxdb-test/rxdb.config.ts`。

## 用法二：Vite 插件

在构建结束后自动生成：

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import { rxDBViteClientGenerator } from '@aiao/rxdb-client-generator/vite';

export default defineConfig({
  plugins: [
    rxDBViteClientGenerator([
      {
        entities: ['src/entities/*.ts'],
        outDir: 'src/generated/entities',
        relationQueryDeep: 3
      }
    ])
  ]
});
```

## 生成结果示例

```text
dist/
  entities/
    index.ts           # 聚合导出
    Todo.ts            # 实体类型、查询类型、关系规则类型
    Menu.ts
```

## 如何接回项目

```ts
// 1) 引入生成的实体类型
import { Todo } from './dist/entities';

// 2) 注册到 RxDB
const rxdb = new RxDB({
  dbName: 'demo',
  entities: [Todo],
  sync: { type: SyncType.None, local: { adapter: 'wa-sqlite' } }
});

// 3) 直接使用静态方法进行类型安全查询
Todo.find({
  where: { combinator: 'and', rules: [{ field: 'completed', operator: '=', value: false }] },
  orderBy: [{ field: 'createdAt', sort: 'desc' }],
  limit: 20
}).subscribe(items => console.log(items));
```

## 参数说明

- `entities`: 需要扫描的实体文件（支持 glob）
- `outDir`: 生成代码输出目录
- `relationQueryDeep`: 关系查询类型展开深度，最小为 1（默认 3）

## 使用提醒

- 仅基于装饰器与类型信息生成声明与类型辅助，不包含运行时代码
- 请确保实体能被正常 import（ESM 环境下的路径与构建需可用）
- 生成物建议纳入版本控制，或在构建阶段生成

## 参考

- 包源码：`packages/rxdb-client-generator`
- 示例配置：`packages/rxdb-test/rxdb.config.ts`
