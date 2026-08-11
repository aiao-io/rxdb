import Link from '@docusaurus/Link';
import Layout from '@theme/Layout';
import { motion } from 'framer-motion';
import { ArrowRight, Blocks, Database, Gauge, Layers3, Workflow, Zap } from 'lucide-react';

import { Button } from '@site/src/components/button';

const demos = [
  {
    name: 'Angular',
    tag: 'SIGNALS',
    path: '/demos/angular',
    sourceRoot: 'apps/dev-rxdb-angular',
    icon: '/angular.svg',
    description: '使用 Signals 绑定查询与实体状态，覆盖表单、关系数据和管理页面。',
    focus: '表单与管理页面',
    features: ['Signals 绑定', '实体表单', '关系详情页', 'Query Builder']
  },
  {
    name: 'React',
    tag: 'HOOKS',
    path: '/demos/react',
    sourceRoot: 'apps/dev-rxdb-react',
    icon: '/react.svg',
    description: '使用 Hooks 订阅查询与实体状态，覆盖列表、编辑器和分支管理。',
    focus: '组件化数据应用',
    features: ['Hooks 查询', '虚拟列表', '代码编辑器', 'Branch Manager']
  },
  {
    name: 'Vue',
    tag: 'COMPOSABLES',
    path: '/demos/vue',
    sourceRoot: 'apps/dev-rxdb-vue',
    icon: '/vue.svg',
    description: '使用 Composables 连接响应式实体，覆盖表格、关系页和文件管理。',
    focus: '表格与文件管理',
    features: ['Composables', 'Reactive 数据流', 'AG Grid', 'File Manager']
  }
] as const;

const comparePoints = [
  {
    icon: Database,
    title: '同一套模型',
    description: '三个演示共用实体模型、查询结构与数据库能力。'
  },
  {
    icon: Workflow,
    title: '差异只在绑定层',
    description: '框架差异集中在 UI 绑定 API，核心数据语义保持一致。'
  },
  {
    icon: Blocks,
    title: '源码可直接对照',
    description: '每个演示都对应 apps/dev-rxdb-* 下的完整源码。'
  },
  {
    icon: Zap,
    title: '覆盖完整业务场景',
    description: '包含关系详情页、Branch Manager 与 File Manager，可用于评估实际接入。'
  }
] as const;

const whatToObserve = [
  '查询结果如何自动更新',
  '详情页和关系 Tab 如何组织数据',
  '同一模型在三套框架里的 API 差异有多小',
  'Query Builder、Branch Manager、File Manager 是否够真实'
] as const;

export default function DemosIndexPage() {
  return (
    <Layout title='在线演示' description='直接对比 RxDB 在 Angular、React、Vue 中的真实接入方式与页面复杂度'>
      <main className='home-shell px-4 pt-20 pb-28 sm:px-6 sm:pt-28'>
        <div className='mx-auto max-w-7xl'>
          <motion.section
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55 }}
            className='mb-20 grid gap-12 lg:grid-cols-[1.15fr_0.85fr] lg:gap-16'
          >
            <div>
              <h1 className='text-foreground mt-4 max-w-4xl text-4xl leading-[1.05] font-semibold tracking-tight sm:text-5xl lg:text-6xl'>
                同一套实体模型
                <span className='home-gradient-text mt-2 block'>三种框架绑定方式</span>
              </h1>
              <p className='text-muted-foreground mt-8 max-w-2xl text-base leading-7 sm:text-lg sm:leading-8'>
                在可运行页面中对照 Angular、React、Vue 的查询订阅、实体状态与复杂视图实现，并可继续查看对应源码。
              </p>
              <div className='mt-10 flex flex-wrap gap-3'>
                <Button asChild>
                  <Link to='/docs/getting-started/'>
                    快速开始
                    <ArrowRight />
                  </Link>
                </Button>
                <Button asChild variant='outline'>
                  <Link to='/architecture'>了解架构</Link>
                </Button>
              </div>
              <div className='border-border mt-12 grid grid-cols-3 gap-0 border-t pt-8'>
                {[
                  { value: '3', label: 'frameworks' },
                  { value: '1', label: 'model semantics' },
                  { value: 'Local', label: 'execution first' }
                ].map(stat => (
                  <div key={stat.label} className='border-border/60 border-r pr-4 last:border-r-0 last:pr-0'>
                    <div className='text-foreground text-3xl font-semibold tracking-tight'>{stat.value}</div>
                    <div className='text-muted-foreground mt-2 font-[family-name:var(--mono-font)] text-[10px] tracking-[0.2em] uppercase'>
                      {stat.label}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className='grid gap-0 sm:grid-cols-2'>
              {comparePoints.map((point, idx) => (
                <div
                  key={point.title}
                  className={`border-border border-t border-l p-6 ${
                    idx % 2 === 1 ? 'sm:border-r' : ''
                  } ${idx >= comparePoints.length - 2 ? 'border-b' : ''}`}
                >
                  <point.icon className='text-primary mb-4 size-5' />
                  <h3 className='text-foreground mb-2 text-base font-semibold tracking-tight'>{point.title}</h3>
                  <p className='text-muted-foreground text-xs leading-5'>{point.description}</p>
                </div>
              ))}
              <div className='border-border col-span-full border-t border-r border-b border-l p-6'>
                <div className='mb-4 flex items-center gap-2.5'>
                  <Gauge className='text-primary size-4' />
                  <span className='eyebrow eyebrow--plain'>what to observe</span>
                </div>
                <div className='grid gap-1.5 sm:grid-cols-2'>
                  {whatToObserve.map(item => (
                    <div key={item} className='flex items-start gap-2 text-xs leading-5'>
                      <span className='text-primary mt-1 shrink-0 text-[8px]'>■</span>
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </motion.section>

          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true, margin: '-80px' }}
            className='border-border/60 mb-10 flex items-center justify-between gap-4 border-t pt-10'
          >
            <span className='eyebrow'>runnable demos</span>
            <span className='section-index'>— 01</span>
          </motion.div>

          <section className='grid gap-4 lg:grid-cols-3'>
            {demos.map((demo, index) => (
              <motion.div
                key={demo.name}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-80px' }}
                transition={{ duration: 0.45, delay: index * 0.05 }}
              >
                <Link to={demo.path} className='group block h-full no-underline hover:no-underline'>
                  <div className='surface-card surface-card--interactive h-full overflow-hidden'>
                    <div className='border-border flex items-center justify-between border-b px-6 py-3'>
                      <div className='flex items-center gap-2.5'>
                        <img src={demo.icon} alt={demo.name} className='h-5 w-5 opacity-90' />
                        <span className='text-foreground font-[family-name:var(--mono-font)] text-xs font-semibold tracking-[0.15em] uppercase'>
                          {demo.name}
                        </span>
                      </div>
                      <span className='mono-chip mono-chip--primary'>RUNNABLE</span>
                    </div>
                    <div className='p-6'>
                      <div className='text-muted-foreground mb-2 font-[family-name:var(--mono-font)] text-[10px] tracking-[0.2em] uppercase'>
                        {demo.focus}
                      </div>
                      <h3 className='text-foreground mb-3 text-3xl font-semibold tracking-tight'>{demo.name}</h3>
                      <p className='text-muted-foreground mb-6 text-sm leading-6'>{demo.description}</p>

                      <div className='border-border -mx-6 border-y'>
                        <div className='divide-border/60 grid grid-cols-2 divide-x text-xs'>
                          {demo.features.map((feature, fi) => (
                            <div
                              key={feature}
                              className={`flex items-center gap-1.5 px-4 py-2.5 ${fi >= 2 ? 'border-border/60 border-t' : ''}`}
                            >
                              <span className='text-primary text-[8px]'>■</span>
                              <span className='truncate'>{feature}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className='mt-6 flex items-center justify-between'>
                        <div className='text-muted-foreground font-[family-name:var(--mono-font)] text-[10px] tracking-wider'>
                          {demo.sourceRoot}
                        </div>
                        <div className='text-primary inline-flex items-center gap-1.5 text-sm font-medium transition-transform group-hover:translate-x-1'>
                          进入演示
                          <ArrowRight className='size-4' />
                        </div>
                      </div>
                    </div>
                  </div>
                </Link>
              </motion.div>
            ))}
          </section>

          <motion.section
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.45 }}
            className='mt-20'
          >
            <div className='home-cta-card p-10 sm:p-16'>
              <div className='flex flex-col gap-8 md:flex-row md:items-center md:justify-between'>
                <div>
                  <h2 className='text-foreground mt-4 text-3xl font-semibold tracking-tight sm:text-4xl'>
                    从演示进入对应文档
                  </h2>
                  <p className='text-muted-foreground mt-4 text-base leading-7'>
                    演示用于比较框架绑定方式；文档进一步说明模型、查询、写入与协作 API 的完整边界。
                  </p>
                </div>
              </div>
              <Button asChild size='lg'>
                <Link to='/docs/getting-started/'>
                  打开快速开始
                  <ArrowRight />
                </Link>
              </Button>
            </div>
          </motion.section>

          <div className='border-border/60 mt-20 flex flex-col items-center justify-between gap-3 border-t pt-8 font-[family-name:var(--mono-font)] text-[11px] tracking-[0.18em] uppercase sm:flex-row'>
            <span className='text-muted-foreground'>
              <Layers3 className='mr-2 inline size-3.5' />
              界面与源码 1:1 对照
            </span>
            <span className='text-muted-foreground'>3 frameworks · 1 model · shared semantics</span>
          </div>
        </div>
      </main>
    </Layout>
  );
}
