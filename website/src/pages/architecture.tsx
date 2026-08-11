import Link from '@docusaurus/Link';
import CodeBlock from '@theme/CodeBlock';
import Layout from '@theme/Layout';
import { motion } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';
import {
  ArrowRight,
  BarChart3,
  CheckCircle,
  Code,
  Database,
  Download,
  FileCode,
  GitBranch,
  Layers3,
  RefreshCw,
  Server,
  Upload,
  Wand2,
  Zap
} from 'lucide-react';
import type { ReactNode } from 'react';

import { Badge } from '@site/src/components/badge';
import { Button } from '@site/src/components/button';

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.06 }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.45 }
  }
};

interface TechItem {
  name: string;
  role: string;
  reason: string;
  icon: LucideIcon;
}

const architectureLayers = [
  {
    icon: Database,
    title: '存储层',
    description: 'SQLite 负责落盘、索引、事务与查询执行。',
    tag: 'LAYER 01'
  },
  {
    icon: RefreshCw,
    title: '响应式层',
    description: 'RxJS 把查询结果、实体变更和副作用汇成同一条数据流。',
    tag: 'LAYER 02'
  },
  {
    icon: Layers3,
    title: '模型层',
    description: '实体元数据统一定义字段、关系、查询构造与生成代码的边界。',
    tag: 'LAYER 03'
  },
  {
    icon: GitBranch,
    title: '协作层',
    description: '分支、同步与撤销重做建立在本地数据版本之上，按需启用。',
    tag: 'LAYER 04'
  }
] as const;

const browserRuntime = [
  {
    icon: Code,
    title: 'UI 与交互层',
    description: '页面、表单与详情视图直接消费本地查询结果，常用读写无需等待网络往返。'
  },
  {
    icon: Layers3,
    title: '本地业务与模型层',
    description: '实体规则、关系约束、查询构造与副作用在浏览器里闭环执行。'
  },
  {
    icon: Database,
    title: '本地数据库层',
    description: 'SQLite + OPFS 负责事务、索引、查询执行与持久化。'
  }
] as const;

const syncActions = [
  {
    icon: Upload,
    title: 'Push',
    description: '把本地提交、分支状态和需要共享的数据推到远端。'
  },
  {
    icon: Download,
    title: 'Pull',
    description: '拉取远端变更，并合并到本地数据流。'
  }
] as const;

const remoteRoles = [
  '保存可共享的版本历史与同步状态',
  '为多设备或多成员提供交换点',
  '通过 pull / push 交换变更，不接管本地业务执行'
] as const;

const techStack: TechItem[] = [
  {
    name: 'SQLite',
    role: '本地存储执行层',
    reason: '提供事务、索引与 SQL 查询，适合多数浏览器端结构化数据场景。',
    icon: Database
  },
  {
    name: 'wa-sqlite',
    role: '推荐 SQLite 运行时',
    reason: '浏览器端 WebAssembly SQLite 的推荐实现，与 OPFS 深度集成，是官方适配器外的首选方案。',
    icon: Database
  },
  {
    name: 'PGlite',
    role: '高级查询执行层',
    reason: '在浏览器内提供 PostgreSQL 兼容能力，适合复杂查询与扩展需求。',
    icon: Database
  },
  {
    name: 'TypeScript',
    role: '模型与类型约束',
    reason: '约束模型定义、生成代码与消费端 API，在编译期暴露类型错误。',
    icon: Code
  },
  {
    name: 'RxJS',
    role: '核心响应式主线',
    reason: '用 Observable 连接查询结果、变更事件与副作用，构成统一的响应式数据流。',
    icon: RefreshCw
  },
  {
    name: 'OPFS',
    role: '可选持久化增强',
    reason: '浏览器支持时使用 OPFS 持久化文件，不支持时选择其他 VFS。',
    icon: FileCode
  },
  {
    name: 'ts-morph',
    role: '代码生成引擎',
    reason: '基于 TypeScript AST，将实体元数据转换为类型、查询构建器与框架适配代码。',
    icon: Wand2
  }
];

interface ImplementedFeature {
  title: string;
  status: string;
  description: string;
  features: string[];
}

const implementedFeatures: ImplementedFeature[] = [
  {
    title: '模型驱动开发',
    status: '已实现',
    description: '用元数据描述实体，并从模型推导查询、表单与类型约束。',
    features: ['实体元数据', '关系建模', '类型安全 CRUD', '响应式查询自动更新']
  },
  {
    title: '跨框架统一 API',
    status: '已实现',
    description: '三个框架共享模型与查询语义，各自保留符合框架习惯的 UI 绑定 API。',
    features: ['Angular Signals', 'React Hooks', 'Vue Composables', 'RxJS Observable 通用支持']
  },
  {
    title: '代码生成链路',
    status: '已实现',
    description: '从模型定义生成类型与辅助代码，减少重复实现。',
    features: ['完整类型推断', '查询构建器', '实体辅助代码', '框架封装输出']
  },
  {
    title: '性能基础设施',
    status: '已实现',
    description: '通过浏览器内数据库、Worker 与查询缓存划分计算和持久化职责。',
    features: ['Worker 支持', 'OPFS 优先持久化', '查询缓存', 'WASM 数据库执行']
  },
  {
    title: '版本与同步基础',
    status: 'MVP 已验证',
    description: '当前已验证版本分支、撤销重做、条件同步与跨 Tab 同步。',
    features: ['Branch 管理', '撤销重做', '跨 Tab 同步', '多种同步策略']
  }
];

interface SectionProps {
  index: string;
  eyebrow: string;
  title: string;
  description?: string;
  children: ReactNode;
}

function Section({ index, eyebrow, title, description, children }: SectionProps) {
  return (
    <section className='relative px-4 py-16 sm:px-6 sm:py-24'>
      <div className='mx-auto max-w-7xl'>
        <motion.div
          initial='hidden'
          whileInView='visible'
          viewport={{ once: true, margin: '-80px' }}
          variants={containerVariants}
        >
          <motion.div variants={itemVariants} className='border-border/60 mb-12 flex flex-col gap-5 border-t pt-10'>
            <div className='flex items-center justify-between gap-4 text-xs'>
              <span className='eyebrow'>{eyebrow}</span>
              <span className='section-index'>— {index}</span>
            </div>
            <h2 className='text-foreground max-w-4xl text-3xl font-semibold tracking-tight sm:text-4xl'>{title}</h2>
            {description ?
              <p className='text-muted-foreground max-w-3xl text-base leading-7 sm:text-lg sm:leading-8'>
                {description}
              </p>
            : null}
          </motion.div>
          {children}
        </motion.div>
      </div>
    </section>
  );
}

function ArchitectureContent(): ReactNode {
  return (
    <div className='home-shell min-h-screen'>
      <section className='relative px-4 pt-20 pb-12 sm:px-6 sm:pt-28'>
        <div className='mx-auto max-w-7xl'>
          <motion.div initial='hidden' animate='visible' variants={containerVariants}>
            <motion.h1
              variants={itemVariants}
              className='text-foreground mt-4 max-w-4xl text-4xl leading-[1.05] font-semibold tracking-tight sm:text-5xl lg:text-6xl'
            >
              RxDB 如何组织浏览器内数据链路
            </motion.h1>
            <motion.p
              variants={itemVariants}
              className='text-muted-foreground mt-8 max-w-3xl text-base leading-7 sm:text-lg sm:leading-8'
            >
              存储、响应式查询、实体模型与 UI 绑定分别承担明确职责，远端同步作为可选协作层接入。
            </motion.p>
            <motion.div variants={itemVariants} className='mt-10 flex flex-wrap gap-3'>
              <Button asChild>
                <Link to='/docs/getting-started/'>
                  快速开始
                  <ArrowRight />
                </Link>
              </Button>
              <Button asChild variant='outline'>
                <Link to='/comparison'>适用场景</Link>
              </Button>
            </motion.div>
          </motion.div>
        </div>
      </section>

      <Section index='01' eyebrow='layers' title='四个层次，按执行职责划分'>
        <div className='grid gap-0 sm:grid-cols-2 lg:grid-cols-4'>
          {architectureLayers.map((layer, idx) => (
            <motion.div
              key={layer.title}
              variants={itemVariants}
              className={`border-border group border-t border-l p-8 transition-colors hover:bg-[color:color-mix(in_oklab,var(--primary)_4%,transparent)] ${
                idx === architectureLayers.length - 1 ? 'lg:border-r' : ''
              } ${idx % 2 === 1 ? 'sm:border-r lg:border-r-0' : ''} ${
                idx >= architectureLayers.length - 2 ? 'sm:border-b' : ''
              } last:border-b lg:last:border-b`}
            >
              <div className='text-muted-foreground mb-6 font-[family-name:var(--mono-font)] text-[10px] tracking-[0.2em]'>
                {layer.tag}
              </div>
              <layer.icon className='text-primary mb-5 size-6' />
              <h3 className='text-foreground mb-3 text-xl font-semibold tracking-tight'>{layer.title}</h3>
              <p className='text-muted-foreground text-sm leading-6'>{layer.description}</p>
            </motion.div>
          ))}
        </div>
        <div className='border-border border-r border-b border-l' />
      </Section>

      <Section
        index='02'
        eyebrow='execution plane'
        title='浏览器就是主执行面'
        description='UI、业务规则、查询与持久化在浏览器内执行；远端负责交换变更，不接管每一次本地读写。'
      >
        <div className='surface-card overflow-hidden p-6 sm:p-8'>
          <div className='grid gap-8 lg:grid-cols-[minmax(0,1.55fr)_220px_minmax(0,0.95fr)] lg:items-center'>
            <div className='border-primary/25 relative overflow-hidden rounded-md border bg-[color:color-mix(in_oklab,var(--primary)_4%,transparent)] p-6'>
              <div className='mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between'>
                <div>
                  <div className='eyebrow mb-3'>Browser runtime</div>
                  <h3 className='text-foreground text-2xl font-semibold tracking-tight'>读写查询先在本地完成</h3>
                  <p className='text-muted-foreground mt-3 max-w-2xl text-sm leading-6'>
                    界面、领域逻辑、查询与事务在浏览器内运行。离线时继续读写，联网后再按需同步。
                  </p>
                </div>
                <Badge>Local-first</Badge>
              </div>

              <div className='grid gap-3 md:grid-cols-3'>
                {browserRuntime.map(zone => (
                  <div key={zone.title} className='border-border bg-background/50 rounded-md border p-4'>
                    <zone.icon className='text-primary mb-3 size-5' />
                    <div className='text-foreground mb-2 text-sm font-semibold'>{zone.title}</div>
                    <p className='text-muted-foreground text-xs leading-5'>{zone.description}</p>
                  </div>
                ))}
              </div>

              <div className='mt-4 grid gap-2 sm:grid-cols-3'>
                {[
                  { title: '交互优先本地执行', note: '体验不被网络往返拖慢。' },
                  { title: '版本按分支流转', note: '撤销、重做、分支与历史围绕数据版本组织。' },
                  { title: '同步按需触发', note: '联网后再 pull / push，本地读写不依赖服务端往返。' }
                ].map(item => (
                  <div key={item.title} className='border-border bg-card/40 rounded-sm border px-3 py-3'>
                    <div className='text-foreground text-xs font-semibold'>{item.title}</div>
                    <div className='text-muted-foreground mt-1 text-[11px] leading-5'>{item.note}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className='flex flex-col items-stretch gap-3'>
              <div className='flex items-center justify-center'>
                <div className='mono-chip mono-chip--primary'>
                  <GitBranch size={12} />
                  sync lane
                </div>
              </div>
              {syncActions.map(action => (
                <div
                  key={action.title}
                  className='border-border bg-card/40 flex items-start gap-3 rounded-md border px-4 py-4'
                >
                  <action.icon className='text-primary mt-0.5 size-4 shrink-0' />
                  <div>
                    <div className='text-foreground text-sm font-semibold'>{action.title}</div>
                    <p className='text-muted-foreground mt-1 text-xs leading-5'>{action.description}</p>
                  </div>
                </div>
              ))}
              <div className='text-muted-foreground flex items-center justify-center gap-2 font-[family-name:var(--mono-font)] text-[11px] tracking-wider'>
                <ArrowRight size={12} />
                VERSION-LEVEL SYNC
              </div>
            </div>

            <div className='border-border bg-card/30 rounded-md border p-6'>
              <div className='mb-5 flex items-center gap-3'>
                <Server className='text-primary size-6' />
                <div>
                  <div className='eyebrow'>remote role</div>
                  <h3 className='text-foreground mt-1 text-lg font-semibold'>远端同步仓库</h3>
                </div>
              </div>

              <p className='text-muted-foreground mb-5 text-sm leading-6'>
                远端充当共享存储或同步中继点，负责交换版本与变更，不替浏览器执行业务主流程。
              </p>

              <div className='space-y-2'>
                {remoteRoles.map(item => (
                  <div
                    key={item}
                    className='border-border bg-background/40 flex items-start gap-3 rounded-sm border px-3 py-2.5'
                  >
                    <CheckCircle className='text-primary mt-0.5 size-3.5 shrink-0' />
                    <span className='text-xs leading-5'>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </Section>

      <Section
        index='03'
        eyebrow='tech stack'
        title='核心技术选型'
        description='每一层都服务于同一个目标——让数据应用真正跑在浏览器里'
      >
        <div className='grid gap-0 sm:grid-cols-2 lg:grid-cols-3'>
          {techStack.map((tech, idx) => (
            <motion.div
              key={tech.name}
              variants={itemVariants}
              className={`border-border group border-t border-l p-6 transition-colors hover:bg-[color:color-mix(in_oklab,var(--primary)_4%,transparent)] ${
                (idx + 1) % 3 === 0 ? 'lg:border-r' : ''
              } ${idx % 2 === 1 ? 'sm:border-r lg:border-r-0' : ''} ${
                idx >= techStack.length - 3 ? 'lg:border-b' : ''
              }`}
            >
              <div className='mb-4 flex items-center justify-between gap-3'>
                <tech.icon className='text-primary size-5' />
                <Badge variant='outline'>{tech.role}</Badge>
              </div>
              <h3 className='text-foreground mb-2 text-lg font-semibold'>{tech.name}</h3>
              <p className='text-muted-foreground text-sm leading-6'>{tech.reason}</p>
            </motion.div>
          ))}
        </div>
        <div className='border-border border-r border-b border-l' />
      </Section>

      <Section
        index='04'
        eyebrow='capabilities'
        title='已落地的能力'
        description='以下能力都可以在文档、demo 和源码里直接验证'
      >
        <div className='space-y-4'>
          {implementedFeatures.map(feature => (
            <motion.div key={feature.title} variants={itemVariants}>
              <div className='surface-card p-6 sm:p-8'>
                <div className='mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between'>
                  <div>
                    <h3 className='text-foreground mb-2 text-xl font-semibold tracking-tight sm:text-2xl'>
                      {feature.title}
                    </h3>
                    <p className='text-muted-foreground text-sm leading-6 sm:text-base'>{feature.description}</p>
                  </div>
                  <Badge>
                    <CheckCircle className='mr-1 size-3' />
                    {feature.status}
                  </Badge>
                </div>
                <div className='grid gap-2 sm:grid-cols-2 lg:grid-cols-4'>
                  {feature.features.map(item => (
                    <div
                      key={item}
                      className='border-border bg-background/40 flex items-center gap-2 rounded-sm border px-3 py-2 text-xs'
                    >
                      <CheckCircle className='text-primary size-3 shrink-0' />
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </Section>

      <Section
        index='05'
        eyebrow='code path'
        title='关键代码路径'
        description='从模型定义到界面订阅，每一步都有明确输入与输出'
      >
        <div className='space-y-6'>
          {[
            {
              icon: FileCode,
              title: '1. 定义模型边界',
              language: 'typescript',
              code: `const TodoEntity: EntityMetadataOptions = {
  name: 'Todo',
  displayName: 'Todo',
  repository: 'Repository',
  extends: ['EntityBase'],
  properties: [
    { name: 'title', type: PropertyType.string },
    { name: 'completed', type: PropertyType.boolean, default: false },
    { name: 'createdAt', type: PropertyType.date }
  ]
};`
            },
            {
              icon: GitBranch,
              title: '2. 生成稳定接口',
              language: 'bash',
              code: `nx run rxdb-client-generator:generate

# 输出内容包括：
# - 实体类型定义
# - CRUD 与查询辅助代码
# - 框架集成封装
# - 关系映射与表单支持`
            },
            {
              icon: Zap,
              title: '3. 把查询接入界面',
              language: 'typescript',
              code: `Todo.find({
  where: {
    combinator: 'and',
    rules: [{ field: 'completed', operator: '=', value: false }]
  }
}).subscribe(todos => {
  console.log('未完成任务：', todos);
});`
            }
          ].map(step => (
            <div key={step.title} className='surface-card overflow-hidden'>
              <div className='border-border flex items-center justify-between gap-2 border-b px-5 py-3'>
                <div className='flex items-center gap-2.5'>
                  <step.icon className='text-primary size-4' />
                  <span className='text-foreground text-sm font-semibold'>{step.title}</span>
                </div>
                <span className='text-muted-foreground font-[family-name:var(--mono-font)] text-[10px] tracking-[0.2em] uppercase'>
                  {step.language}
                </span>
              </div>
              <div className='p-0'>
                <CodeBlock language={step.language}>{step.code}</CodeBlock>
              </div>
            </div>
          ))}

          <div className='surface-card overflow-hidden'>
            <div className='border-border flex items-center justify-between gap-2 border-b px-5 py-3'>
              <div className='flex items-center gap-2.5'>
                <BarChart3 className='text-primary size-4' />
                <span className='text-foreground text-sm font-semibold'>4. 复用同一套查询语义</span>
              </div>
              <span className='text-muted-foreground font-[family-name:var(--mono-font)] text-[10px] tracking-[0.2em] uppercase'>
                3 frameworks
              </span>
            </div>
            <div className='grid gap-0 lg:grid-cols-3'>
              {[
                { name: 'React', tag: 'HOOKS' },
                { name: 'Vue', tag: 'COMPOSABLES' },
                { name: 'Angular', tag: 'SIGNALS' }
              ].map((framework, i) => (
                <div
                  key={framework.name}
                  className={`border-border p-5 ${i < 2 ? 'border-b lg:border-r lg:border-b-0' : ''}`}
                >
                  <div className='mb-3 flex items-center gap-2'>
                    <span className='mono-chip mono-chip--primary'>{framework.tag}</span>
                    <span className='text-foreground text-sm font-semibold'>{framework.name}</span>
                  </div>
                  <CodeBlock language='typescript' className='text-xs'>
                    {`const { value: todos } =
  useFind(Todo, { where: {...} });`}
                  </CodeBlock>
                </div>
              ))}
            </div>
            <div className='border-border text-muted-foreground border-t px-5 py-4 text-center text-xs'>
              三个框架共享模型与查询语义，差异集中在各自的 UI 绑定 API。
            </div>
          </div>
        </div>
      </Section>

      <section className='relative px-4 pb-28 sm:px-6'>
        <div className='mx-auto max-w-7xl'>
          <motion.div
            initial='hidden'
            whileInView='visible'
            viewport={{ once: true, margin: '-80px' }}
            variants={containerVariants}
          >
            <motion.div variants={itemVariants}>
              <div className='home-cta-card p-10 sm:p-16'>
                <div className='flex flex-col gap-8 md:flex-row md:items-start md:justify-between'>
                  <div>
                    <h2 className='text-foreground mt-4 text-3xl font-semibold tracking-tight sm:text-4xl'>
                      从模型定义开始验证数据链路
                    </h2>
                    <p className='text-muted-foreground mt-4 text-base leading-7'>
                      先通过在线演示观察查询、关系与写入如何落地，再结合文档评估存储、框架绑定与同步边界。
                    </p>
                  </div>
                </div>
                <Button asChild size='lg' className='shrink-0'>
                  <Link to='/demos'>
                    查看在线演示
                    <ArrowRight />
                  </Link>
                </Button>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </section>
    </div>
  );
}

export default function ArchitecturePage(): ReactNode {
  return (
    <Layout
      title='技术架构'
      description='RxDB 如何把数据库、响应式查询、模型驱动开发与同步协作在浏览器内组织成清晰层次'
    >
      <ArchitectureContent />
    </Layout>
  );
}
