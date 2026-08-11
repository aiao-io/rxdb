import Link from '@docusaurus/Link';
import Layout from '@theme/Layout';
import { motion } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';
import {
  ArrowRight,
  Blocks,
  Boxes,
  Database,
  FileCode2,
  GitBranch,
  Layers3,
  Orbit,
  PlayCircle,
  ShieldCheck,
  Sparkles,
  TabletSmartphone,
  Workflow,
  Wrench
} from 'lucide-react';
import type { ReactNode } from 'react';

import { Button } from '@site/src/components/button';
import { HomeSqlPlayground } from '@site/src/components/home-sql-playground';

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.06
    }
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

const heroHighlights = [
  '浏览器内运行 SQLite 查询、事务与索引',
  'RxJS 统一查询结果与数据变更',
  '一套实体模型，对接 Angular、React、Vue'
];

interface Pillar {
  icon: LucideIcon;
  title: string;
  description: string;
}

const platformPillars: Pillar[] = [
  {
    icon: Database,
    title: '数据在本地执行',
    description: '查询、事务、索引与持久化在浏览器内完成，常用读写无需等待网络往返。'
  },
  {
    icon: Workflow,
    title: '查询结果可订阅',
    description: '数据变化会更新订阅结果，减少手动 refetch、缓存失效和状态同步代码。'
  },
  {
    icon: Blocks,
    title: '模型集中定义规则',
    description: '字段、关系、索引与类型集中在实体模型中，避免数据规则散落在页面和服务层。'
  },
  {
    icon: TabletSmartphone,
    title: '跨框架共享语义',
    description: 'Angular、React、Vue 共享模型、查询与写入语义，差异保留在各自的 UI 绑定层。'
  }
];

const flowSteps = [
  {
    icon: FileCode2,
    title: '定义模型边界',
    description: '先定义字段、关系与索引，为后续查询、表单和列表建立稳定的数据边界。'
  },
  {
    icon: Wrench,
    title: '接入本地执行层',
    description: '按查询与兼容性需求选择 SQLite 或 PGlite，在浏览器内完成查询与持久化。'
  },
  {
    icon: Orbit,
    title: '订阅查询结果',
    description: '将查询结果作为可订阅数据源接入界面，由数据变化驱动视图更新。'
  },
  {
    icon: GitBranch,
    title: '按需引入协作',
    description: '本地读写链路稳定后，再按业务需要引入分支、撤销重做与同步。'
  }
];

const frameworkCards = [
  {
    title: 'Angular',
    tag: 'SIGNALS',
    focus: '复杂后台与表单',
    description: '使用 Signals 绑定查询和实体状态，查看表单、关系数据与管理页面的实现。',
    href: '/demos/angular',
    icon: '/angular.svg'
  },
  {
    title: 'React',
    tag: 'HOOKS',
    focus: '组件化数据应用',
    description: '使用 Hooks 订阅查询和实体状态，查看列表、编辑器与分支管理的实现。',
    href: '/demos/react',
    icon: '/react.svg'
  },
  {
    title: 'Vue',
    tag: 'COMPOSABLES',
    focus: '高迭代业务界面',
    description: '使用 Composables 连接响应式实体，查看表格、关系页与文件管理的实现。',
    href: '/demos/vue',
    icon: '/vue.svg'
  }
];

interface DocEntrance {
  icon: LucideIcon;
  title: string;
  description: string;
  href: string;
  hardNavigation?: boolean;
}

const docEntrances: DocEntrance[] = [
  {
    icon: Sparkles,
    title: '快速开始',
    description: '从模型定义到 UI 绑定，跑通一条最小本地数据链路。',
    href: '/docs/getting-started/'
  },
  {
    icon: Layers3,
    title: '模型定义',
    description: '了解如何集中定义字段、关系与索引，并生成类型安全的数据接口。',
    href: '/docs/model-definition/'
  },
  {
    icon: Database,
    title: '模型查询',
    description: '查看基础查询、树图结构查询与实时订阅的完整读取路径。',
    href: '/docs/model-query/'
  },
  {
    icon: Boxes,
    title: '模型修改',
    description: '通过统一入口完成创建、更新、删除与事务操作。',
    href: '/docs/model-mutation/'
  },
  {
    icon: GitBranch,
    title: '数据协作',
    description: '分支、撤销重做与同步如何按需叠加到已稳定的本地链路之上。',
    href: '/docs/collaboration/branch'
  },
  {
    icon: PlayCircle,
    title: '在线演示',
    description: '对照三套框架的可运行页面与源码，评估实际接入方式。',
    href: '/demos'
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
    <section className='relative px-4 py-20 sm:px-6 sm:py-28'>
      <div className='mx-auto max-w-7xl'>
        <motion.div
          initial='hidden'
          whileInView='visible'
          viewport={{ once: true, margin: '-80px' }}
          variants={containerVariants}
        >
          <motion.div variants={itemVariants} className='border-border/60 mb-14 flex flex-col gap-5 border-t pt-10'>
            <div className='flex items-center justify-between gap-4 text-xs'>
              <span className='eyebrow'>{eyebrow}</span>
              <span className='section-index'>— {index}</span>
            </div>
            <h2 className='text-foreground max-w-4xl text-3xl font-semibold tracking-tight sm:text-5xl'>{title}</h2>
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

function HeroSection(): ReactNode {
  return (
    <header className='home-hero px-4 pt-20 pb-12 sm:px-6 sm:pt-28 sm:pb-20'>
      <div className='mx-auto max-w-7xl'>
        <div className='grid gap-12 lg:grid-cols-[1.1fr_0.9fr] lg:gap-16'>
          <motion.div initial='hidden' animate='visible' variants={containerVariants}>
            <motion.h1
              variants={itemVariants}
              className='text-foreground mt-4 max-w-4xl text-5xl leading-[1.02] font-semibold tracking-tight sm:text-6xl lg:text-7xl'
            >
              RxDB
              <span className='home-gradient-text mt-3 block'>浏览器内的数据基础设施</span>
            </motion.h1>
            <motion.p
              variants={itemVariants}
              className='text-muted-foreground mt-8 max-w-2xl text-base leading-7 sm:text-lg sm:leading-8'
            >
              在浏览器内完成结构化数据的查询、写入与持久化，通过 RxJS 响应数据变化，并为 Angular、React、Vue
              提供一致的模型语义。需要跨设备共享时，再按需连接远端同步。
            </motion.p>
            <motion.div variants={itemVariants} className='mt-10 flex flex-wrap gap-3'>
              <Button size='lg' asChild>
                <Link to='/docs/getting-started/'>
                  快速开始
                  <ArrowRight />
                </Link>
              </Button>
              <Button size='lg' variant='outline' asChild>
                <Link to='/demos'>查看框架演示</Link>
              </Button>
              <Button size='lg' variant='ghost' asChild>
                <Link to='/architecture'>
                  了解架构
                  <ArrowRight />
                </Link>
              </Button>
            </motion.div>
            <motion.div variants={itemVariants} className='mt-12 grid gap-2 sm:grid-cols-1'>
              {heroHighlights.map(item => (
                <div
                  key={item}
                  className='group border-border hover:border-primary flex items-center gap-3 border-l-2 py-1.5 pl-4 transition-colors'
                >
                  <ShieldCheck className='text-primary size-4 shrink-0' />
                  <span className='text-sm leading-6 sm:text-[0.95rem]'>{item}</span>
                </div>
              ))}
            </motion.div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.55 }}
            className='hero-code-panel'
          >
            <div className='border-border bg-card/70 overflow-hidden rounded-lg border backdrop-blur-xl'>
              <div className='space-y-4 p-4'>
                <HomeSqlPlayground />
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </header>
  );
}

function MetricsStrip(): ReactNode {
  const metrics = [
    { label: 'FRAMEWORKS', value: '3', note: 'Angular · React · Vue' },
    { label: 'RUNTIME', value: 'SQLite', note: '浏览器内执行引擎' },
    { label: 'PERSISTENCE', value: 'OPFS', note: '按能力选择 OPFS / IDB' },
    { label: 'STREAMING', value: 'RxJS', note: '查询与事件同一主线' }
  ];

  return (
    <section className='relative px-4 sm:px-6'>
      <div className='mx-auto max-w-7xl'>
        <div className='border-border bg-card/30 grid gap-6 rounded-lg border backdrop-blur sm:grid-cols-2 lg:grid-cols-4'>
          {metrics.map((m, i) => (
            <div
              key={m.label}
              className={`p-6 ${i < 3 ? 'border-border/60 lg:border-r' : ''} ${i === 0 || i === 2 ? 'sm:border-b lg:border-b-0' : ''} ${i === 1 ? 'sm:border-b lg:border-b-0' : ''}`}
            >
              <div className='text-muted-foreground font-[family-name:var(--mono-font)] text-[10px] tracking-[0.18em] uppercase'>
                {m.label}
              </div>
              <div className='text-foreground mt-3 text-2xl font-semibold'>{m.value}</div>
              <div className='text-muted-foreground mt-1 text-xs'>{m.note}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default function Home(): ReactNode {
  return (
    <Layout
      title='浏览器内的数据基础设施'
      description='RxDB 为 Angular、React、Vue 提供浏览器内数据库、响应式查询与类型安全的统一模型。'
    >
      <main className='home-shell'>
        <HeroSection />

        <MetricsStrip />

        <Section
          index='01'
          eyebrow='the problem'
          title='复杂数据应用需要明确的数据层'
          description='把存储、查询、写入与响应式更新放进一条可验证的链路，避免用页面状态承担数据基础设施的职责。'
        >
          <div className='grid gap-0 sm:grid-cols-2 lg:grid-cols-4'>
            {platformPillars.map((pillar, idx) => (
              <motion.div
                key={pillar.title}
                variants={itemVariants}
                className={`border-border group border-t border-l p-8 transition-colors hover:bg-[color:color-mix(in_oklab,var(--primary)_4%,transparent)] ${idx === platformPillars.length - 1 ? 'lg:border-r' : ''} ${idx >= 2 ? 'sm:[&:nth-child(3)]:border-l sm:[&:nth-child(4)]:border-l' : ''} last:border-b sm:last:border-b-0 lg:last:border-b-0 ${idx >= platformPillars.length - 2 ? 'sm:border-b lg:border-b' : ''}`}
              >
                <div className='data-cube mb-6' />
                <div className='text-muted-foreground mb-2 font-[family-name:var(--mono-font)] text-[10px] tracking-[0.2em] uppercase'>
                  {String(idx + 1).padStart(2, '0')} / Pillar
                </div>
                <h3 className='text-foreground mb-3 text-xl font-semibold tracking-tight'>{pillar.title}</h3>
                <p className='text-muted-foreground text-sm leading-6'>{pillar.description}</p>
              </motion.div>
            ))}
          </div>
          <div className='border-border border-r border-b border-l' />
        </Section>

        <Section
          index='02'
          eyebrow='integration path'
          title='用四步验证最小数据链路'
          description='推荐顺序：定义模型 → 接入数据库 → 订阅查询 → 按需增加同步与协作。每一步都有清晰的验证结果。'
        >
          <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-4'>
            {flowSteps.map((step, index) => (
              <motion.div key={step.title} variants={itemVariants}>
                <div className='surface-card surface-card--interactive h-full p-6'>
                  <div className='mb-6 flex items-center justify-between'>
                    <span className='text-primary font-[family-name:var(--mono-font)] text-xs tracking-[0.2em]'>
                      STEP / {String(index + 1).padStart(2, '0')}
                    </span>
                    <step.icon className='text-muted-foreground size-4' />
                  </div>
                  <h3 className='text-foreground mb-3 text-lg leading-tight font-semibold'>{step.title}</h3>
                  <p className='text-muted-foreground text-sm leading-6'>{step.description}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </Section>

        <Section
          index='03'
          eyebrow='framework bindings'
          title='三套框架，共享一套数据语义'
          description='模型、查询与写入规则由核心层提供；Angular、React、Vue 分别使用 Signals、Hooks 与 Composables 完成 UI 绑定。'
        >
          <div className='grid gap-4 lg:grid-cols-3'>
            {frameworkCards.map(card => (
              <motion.div key={card.title} variants={itemVariants}>
                <Link to={card.href} className='group block no-underline hover:no-underline'>
                  <div className='surface-card surface-card--interactive h-full p-8'>
                    <div className='mb-8 flex items-start justify-between gap-4'>
                      <img src={card.icon} alt={card.title} className='h-10 w-10 opacity-90' />
                      <span className='mono-chip'>{card.tag}</span>
                    </div>
                    <div className='text-muted-foreground mb-2 font-[family-name:var(--mono-font)] text-[10px] tracking-[0.2em] uppercase'>
                      {card.focus}
                    </div>
                    <h3 className='text-foreground mb-3 text-3xl font-semibold'>{card.title}</h3>
                    <p className='text-muted-foreground mb-6 text-sm leading-6'>{card.description}</p>
                    <div className='text-primary inline-flex items-center gap-1.5 text-sm font-medium transition-transform group-hover:translate-x-1'>
                      查看 {card.title} 接入
                      <ArrowRight className='size-4' />
                    </div>
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>
        </Section>

        <Section
          index='04'
          eyebrow='documentation'
          title='文档按接入顺序组织'
          description='从最小链路开始，再进入建模、查询、写入与协作主题。每一部分都对应明确的使用场景。'
        >
          <div className='grid gap-4 md:grid-cols-2 xl:grid-cols-3'>
            {docEntrances.map((item, index) => {
              const Content = (
                <div className='surface-card surface-card--interactive group h-full p-6'>
                  <div className='mb-5 flex items-start justify-between gap-4'>
                    <div className='data-cube data-cube--sm' />
                    <span className='text-muted-foreground font-[family-name:var(--mono-font)] text-[10px] tracking-[0.22em] uppercase'>
                      {String(index + 1).padStart(2, '0')}
                    </span>
                  </div>
                  <div className='mb-3 flex items-center justify-between gap-4'>
                    <h3 className='text-foreground text-lg font-semibold tracking-tight'>{item.title}</h3>
                    <ArrowRight className='text-muted-foreground size-4 transition-transform group-hover:translate-x-1' />
                  </div>
                  <p className='text-muted-foreground text-sm leading-6'>{item.description}</p>
                </div>
              );

              return (
                <motion.div key={item.title} variants={itemVariants}>
                  {item.hardNavigation ?
                    <a href={item.href} className='no-underline hover:no-underline'>
                      {Content}
                    </a>
                  : <Link to={item.href} className='no-underline hover:no-underline'>
                      {Content}
                    </Link>
                  }
                </motion.div>
              );
            })}
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
                <div className='home-cta-card p-10 sm:p-16 lg:p-20'>
                  <h2 className='text-foreground mt-6 max-w-3xl text-3xl leading-tight font-semibold tracking-tight sm:text-5xl'>
                    跑通最小链路，再评估接入
                  </h2>
                  <p className='text-muted-foreground mt-6 text-base leading-7 sm:text-lg sm:leading-8'>
                    先完成模型、数据库、查询和 UI 绑定，再通过三套框架演示与架构说明核对能力边界。
                  </p>
                  <div className='mt-10 flex flex-wrap justify-center gap-3'>
                    <Button size='lg' asChild>
                      <Link to='/docs/getting-started/'>
                        进入快速开始
                        <ArrowRight />
                      </Link>
                    </Button>
                    <Button size='lg' variant='outline' asChild>
                      <Link to='/demos'>打开在线演示</Link>
                    </Button>
                    <Button size='lg' variant='ghost' asChild>
                      <Link to='/comparison'>
                        适用场景
                        <ArrowRight />
                      </Link>
                    </Button>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          </div>
        </section>
      </main>
    </Layout>
  );
}
