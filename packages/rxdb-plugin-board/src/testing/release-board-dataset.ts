import { getEntityMutations, type EntityInstanceType, type RxDB, type UUID } from '@aiao/rxdb';
import { firstValueFrom } from 'rxjs';

import { BoardLabel } from '../entities/board-label.entity.js';
import { Board } from '../entities/board.entity.js';
import { Column } from '../entities/column.entity.js';
import { TaskLabel } from '../entities/task-label.entity.js';
import { Task } from '../entities/task.entity.js';
import { BoardDomainError } from '../errors.js';
import { matchAll } from '../query.js';

/**
 * @fileoverview 看板确定性种子（US-540）
 *
 * 主板「rxdb 1.0 发布计划」4 列共 12 条任务（5 / 4 / 3 / 0），含板级标签与截止日；
 * 同一数据集另含隔离板「引擎研究草稿」——8 条短标题任务全部含「同步」，
 * 用于板内搜索的切板隔离与分页验收（异板高排位命中不挤空当前板）。
 * demo 与 vitest 用例共用同一份；`id` 与审计时间戳由种子固定给出，
 * 零随机、零 `Date.now()`（否则 e2e 只能断言「大概有几条」）。
 *
 * 种子只装进新库（启动页「装载演示数据」或工具菜单「重置为演示数据」），
 * 不向已有库追加，避免固定 ID 撞主键（US-537）。
 */

/** 种子审计时间戳的固定基准（远早于任何会话起点，种子变更不进入撤销范围）。 */
export const SEED_TIMESTAMP = new Date('2026-10-01T00:00:00.000Z');

/** 主板 id。 */
export const RELEASE_BOARD_ID: UUID = 'b0000000-0000-4000-8000-000000000001';
/** 隔离板 id（板内搜索的同词隔离验收）。 */
export const ISOLATION_BOARD_ID: UUID = 'b0000000-0000-4000-8000-000000000002';

/** 主板列：To do / Doing / Done / Ideas（末列空）。 */
export const RELEASE_COLUMN_IDS = [
  'c0000000-0000-4000-8000-000000000001',
  'c0000000-0000-4000-8000-000000000002',
  'c0000000-0000-4000-8000-000000000003',
  'c0000000-0000-4000-8000-000000000004'
] as const;

/** 隔离板唯一的列「研究」。 */
export const ISOLATION_COLUMN_ID: UUID = 'c0000000-0000-4000-8000-000000000005';

/** 主板标签：核心 / 文档 / 测试 / 发布。 */
export const RELEASE_LABEL_IDS = [
  'a0000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000002',
  'a0000000-0000-4000-8000-000000000003',
  'a0000000-0000-4000-8000-000000000004'
] as const;

const taskId = (index: number): UUID => `e0000000-0000-4000-8000-${String(index).padStart(12, '0')}` as UUID;
const linkId = (index: number): UUID => `f0000000-0000-4000-8000-${String(index).padStart(12, '0')}` as UUID;

/** 主板任务：标题 / 描述 / 截止日 / 标签下标（空数组 = 无标签）。 */
interface SeedTask {
  readonly title: string;
  readonly description: string | null;
  readonly dueDate: string | null;
  readonly labels: readonly number[];
}

const RELEASE_TASKS: readonly SeedTask[][] = [
  // To do（5）
  [
    { title: '修复登录 bug', description: '登录页在弱网下超时后没有重试入口。', dueDate: '2026-11-05', labels: [0] },
    { title: '写发布说明', description: null, dueDate: null, labels: [1] },
    {
      title: '同步插件适配 Supabase',
      description: '同步配置的实例级覆盖要先落到 Supabase 适配器。',
      dueDate: '2026-11-08',
      labels: [0]
    },
    {
      title: '回归测试：工作树同步',
      description: '工作树页面的同步回归用例补齐三端。',
      dueDate: '2026-11-12',
      labels: [2]
    },
    { title: '整理同步迁移指南', description: '从 0.0.26 起的迁移路径逐条核对。', dueDate: '2026-11-12', labels: [1] }
  ],
  // Doing（4）
  [
    { title: '树拖拽落点修复', description: '懒加载节点上的落点判定仍有偏差。', dueDate: '2026-10-30', labels: [0] },
    { title: '同步水位线调优', description: '推送回执推进水位线的边界再压一遍。', dueDate: '2026-11-01', labels: [0] },
    { title: 'DevTools 同步面板重构', description: null, dueDate: null, labels: [] },
    { title: '补齐三端对称', description: '三端差异清单逐项关闭。', dueDate: '2026-10-28', labels: [2] }
  ],
  // Done（3）
  [
    { title: '发布桥接版本 v0.0.26', description: null, dueDate: '2026-10-01', labels: [3] },
    {
      title: '全量同步测试门禁接通',
      description: '同步相关的共享套件全部接入 CI。',
      dueDate: '2026-10-05',
      labels: [2]
    },
    { title: 'API 基线自动化', description: null, dueDate: '2026-10-08', labels: [3] }
  ]
];

/**
 * 隔离板任务：全部短标题含「同步」、短描述再含一次（bm25 高排位，供板内过滤验收——
 * 主板任务的标题 + 长描述同样双命中，但文档更长、排位更低）。
 */
const ISOLATION_TITLES: readonly string[] = [
  '同步冲突检测',
  '同步协议草案',
  '同步性能基准',
  '同步重试策略',
  '同步离线队列',
  '同步监控面板',
  '同步权限模型',
  '同步回放机制'
];

/** 隔离板任务的短描述：与标题同词一次，保持文档短而词频高。 */
const ISOLATION_DESCRIPTION = '同步机制同步回放';

/**
 * 装载确定性种子：主板 + 隔离板，固定 ID 与审计时间戳。
 * 经 EntityManager 一次批量写入（自动按组追加 `sortOrder`），两次装载的五张业务表逐字节相同。
 *
 * @throws {@link BoardDomainError} `seed_target_not_empty`：库里已有看板（种子不向已有库追加，
 *   否则固定 ID 撞主键、逐条写入会在中途失败留下半套种子）。外键 RESTRICT 保证无板即五张表全空
 */
export async function seedReleaseBoardDataset(rxdb: RxDB): Promise<void> {
  const instantiate = rxdb.entityManager.instantiate.bind(rxdb.entityManager);
  const boardRepo = rxdb.entityManager.getRepository(Board);
  if ((await firstValueFrom(boardRepo.count({ where: matchAll() }))) > 0) {
    throw new BoardDomainError('seed_target_not_empty', '演示数据只能装进空库');
  }

  type SeedEntity =
    | EntityInstanceType<typeof Board>
    | EntityInstanceType<typeof Column>
    | EntityInstanceType<typeof Task>
    | EntityInstanceType<typeof BoardLabel>
    | EntityInstanceType<typeof TaskLabel>;
  const entities: SeedEntity[] = [
    instantiate(Board, {
      id: RELEASE_BOARD_ID,
      title: 'rxdb 1.0 发布计划',
      description: '1.0 发布前的全部工作。',
      createdAt: SEED_TIMESTAMP,
      updatedAt: SEED_TIMESTAMP
    }),
    instantiate(Board, {
      id: ISOLATION_BOARD_ID,
      title: '引擎研究草稿',
      description: null,
      createdAt: SEED_TIMESTAMP,
      updatedAt: SEED_TIMESTAMP
    })
  ];

  for (let index = 0; index < RELEASE_COLUMN_IDS.length; index++) {
    entities.push(
      instantiate(Column, {
        id: RELEASE_COLUMN_IDS[index],
        boardId: RELEASE_BOARD_ID,
        title: ['To do', 'Doing', 'Done', 'Ideas'][index],
        createdAt: SEED_TIMESTAMP,
        updatedAt: SEED_TIMESTAMP
      })
    );
  }
  entities.push(
    instantiate(Column, {
      id: ISOLATION_COLUMN_ID,
      boardId: ISOLATION_BOARD_ID,
      title: '研究',
      createdAt: SEED_TIMESTAMP,
      updatedAt: SEED_TIMESTAMP
    })
  );

  const labelNames = [
    { name: '核心', color: '#e11d48' },
    { name: '文档', color: '#2563eb' },
    { name: '测试', color: '#16a34a' },
    { name: '发布', color: '#d97706' }
  ] as const;
  for (let index = 0; index < labelNames.length; index++) {
    entities.push(
      instantiate(BoardLabel, {
        id: RELEASE_LABEL_IDS[index],
        boardId: RELEASE_BOARD_ID,
        name: labelNames[index].name,
        color: labelNames[index].color,
        createdAt: SEED_TIMESTAMP,
        updatedAt: SEED_TIMESTAMP
      })
    );
  }

  let taskIndex = 0;
  let linkIndex = 0;
  for (let column = 0; column < RELEASE_TASKS.length; column++) {
    for (const seed of RELEASE_TASKS[column]) {
      const task = instantiate(Task, {
        id: taskId(taskIndex),
        columnId: RELEASE_COLUMN_IDS[column],
        title: seed.title,
        description: seed.description,
        dueDate: seed.dueDate,
        createdAt: SEED_TIMESTAMP,
        updatedAt: SEED_TIMESTAMP
      });
      entities.push(task);
      for (const label of seed.labels) {
        entities.push(
          instantiate(TaskLabel, {
            id: linkId(linkIndex),
            taskId: task.id,
            labelId: RELEASE_LABEL_IDS[label],
            createdAt: SEED_TIMESTAMP,
            updatedAt: SEED_TIMESTAMP
          })
        );
        linkIndex++;
      }
      taskIndex++;
    }
  }
  for (let index = 0; index < ISOLATION_TITLES.length; index++) {
    entities.push(
      instantiate(Task, {
        id: taskId(taskIndex + index),
        columnId: ISOLATION_COLUMN_ID,
        title: ISOLATION_TITLES[index],
        description: ISOLATION_DESCRIPTION,
        dueDate: null,
        createdAt: SEED_TIMESTAMP,
        updatedAt: SEED_TIMESTAMP
      })
    );
  }

  await rxdb.entityManager.mutations(
    getEntityMutations({
      needSaveEntities: entities,
      needRemoveEntities: []
    })
  );
}

/** 种子看板实体实例类型。 */
export type BoardSeedEntity = InstanceType<typeof Board>;
/** 种子列实体实例类型。 */
export type ColumnSeedEntity = InstanceType<typeof Column>;
/** 种子任务实体实例类型。 */
export type TaskSeedEntity = InstanceType<typeof Task>;
