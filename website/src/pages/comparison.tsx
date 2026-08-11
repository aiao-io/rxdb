import Link from '@docusaurus/Link';
import Layout from '@theme/Layout';
import { motion } from 'framer-motion';
import { ArrowRight, CircleSlash, Code, Database, GitBranch, RefreshCw, ShieldCheck, Users } from 'lucide-react';
import type { ReactNode } from 'react';

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

const reasons = [
  {
    icon: Database,
    title: '需要浏览器内 SQL 与事务',
    description: '数据量、关系和离线编辑已超出接口缓存的承载范围，需要稳定的本地执行层。',
    tag: 'SIGNAL 01'
  },
  {
    icon: RefreshCw,
    title: '需要订阅查询结果',
    description: '查询、数据变更与界面更新需要通过一条响应式链路保持一致。',
    tag: 'SIGNAL 02'
  },
  {
    icon: GitBranch,
    title: '需要统一实体模型',
    description: '类型、查询、关系与生成代码需要围绕实体模型组织，而不是分散在页面中。',
    tag: 'SIGNAL 03'
  }
] as const;

const fitTeams = [
  '前端承担复杂业务规则，需要事务、关系查询和可持续演进的本地数据层。',
  '多个 Angular、React 或 Vue 应用需要共享模型、查询与写入语义。',
  '应用需要在浏览器内完成复杂查询、离线编辑与关系数据展示。'
] as const;

const nonFitTeams = [
  '只需缓存少量 REST 数据并渲染简单表单，引入数据库与模型层的成本高于收益。',
  '团队不使用 RxJS，也不接受模型驱动约束，接入成本会明显上升。',
  '你要的是托管式同步服务、CRDT 多人实时协同或权限系统——当前重点不在这里。'
] as const;

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

function ComparisonContent(): ReactNode {
  return (
    <div className='home-shell min-h-screen'>
      <section className='relative px-4 pt-20 pb-12 sm:px-6 sm:pt-28'>
        <div className='mx-auto max-w-7xl'>
          <motion.div initial='hidden' animate='visible' variants={containerVariants}>
            <motion.h1
              variants={itemVariants}
              className='text-foreground mt-4 max-w-4xl text-4xl leading-[1.05] font-semibold tracking-tight sm:text-5xl lg:text-6xl'
            >
              RxDB 是否适合你的项目
            </motion.h1>
            <motion.p
              variants={itemVariants}
              className='text-muted-foreground mt-8 max-w-3xl text-base leading-7 sm:text-lg sm:leading-8'
            >
              先核对本地执行、响应式查询和跨框架模型是否对应你的真实需求，再评估引入数据库与 RxJS 的成本。
            </motion.p>
            <motion.div variants={itemVariants} className='mt-10 flex flex-wrap gap-3'>
              <Button asChild>
                <Link to='/docs/getting-started/'>快速开始</Link>
              </Button>
              <Button asChild variant='outline'>
                <Link to='/architecture'>了解架构</Link>
              </Button>
            </motion.div>
          </motion.div>
        </div>
      </section>

      <Section
        index='01'
        eyebrow='signals'
        title='先确认三个关键需求'
        description='这三个条件越明确，RxDB 带来的收益越容易验证。'
      >
        <div className='grid gap-0 md:grid-cols-3'>
          {reasons.map((reason, idx) => (
            <motion.div
              key={reason.title}
              variants={itemVariants}
              className={`border-border group border-t border-l p-8 transition-colors hover:bg-[color:color-mix(in_oklab,var(--primary)_4%,transparent)] ${
                idx === reasons.length - 1 ? 'md:border-r' : ''
              }`}
            >
              <div className='text-muted-foreground mb-6 font-[family-name:var(--mono-font)] text-[10px] tracking-[0.2em]'>
                {reason.tag}
              </div>
              <reason.icon className='text-primary mb-5 size-6' />
              <h3 className='text-foreground mb-3 text-xl font-semibold tracking-tight'>{reason.title}</h3>
              <p className='text-muted-foreground text-sm leading-6'>{reason.description}</p>
            </motion.div>
          ))}
        </div>
        <div className='border-border border-r border-b border-l' />
      </Section>

      <Section index='02' eyebrow='fit / non-fit' title='适用场景与不适用场景'>
        <div className='grid gap-6 lg:grid-cols-2'>
          <motion.div variants={itemVariants}>
            <div className='surface-card relative h-full overflow-hidden p-8'>
              <div className='mb-6 flex items-center justify-between'>
                <Users className='text-primary size-6' />
                <span className='mono-chip mono-chip--primary'>FIT</span>
              </div>
              <h3 className='text-foreground mb-2 text-2xl font-semibold tracking-tight'>适合的场景</h3>
              <p className='text-muted-foreground mb-6 text-sm leading-6'>符合的条件越多，接入收益越清晰。</p>
              <div className='divide-border/50 -mx-2 divide-y'>
                {fitTeams.map(item => (
                  <div key={item} className='flex items-start gap-3 px-2 py-4 first:pt-0 last:pb-0'>
                    <ShieldCheck className='text-primary mt-0.5 size-4 shrink-0' />
                    <p className='text-sm leading-6'>{item}</p>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>

          <motion.div variants={itemVariants}>
            <div className='surface-card relative h-full overflow-hidden p-8'>
              <div className='mb-6 flex items-center justify-between'>
                <Code className='text-muted-foreground size-6' />
                <span className='mono-chip'>NOT FIT</span>
              </div>
              <h3 className='text-foreground mb-2 text-2xl font-semibold tracking-tight'>不适合的情况</h3>
              <p className='text-muted-foreground mb-6 text-sm leading-6'>以下场景通常有更轻量或更成熟的方案。</p>
              <div className='divide-border/50 -mx-2 divide-y'>
                {nonFitTeams.map(item => (
                  <div key={item} className='flex items-start gap-3 px-2 py-4 first:pt-0 last:pb-0'>
                    <CircleSlash className='text-muted-foreground mt-0.5 size-4 shrink-0' />
                    <p className='text-sm leading-6'>{item}</p>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        </div>
      </Section>

      <Section index='03' eyebrow='scope' title='当前协作能力边界'>
        <motion.div variants={itemVariants}>
          <div className='surface-card p-8 sm:p-10'>
            <div className='mb-4 flex items-center gap-3'>
              <GitBranch className='text-primary size-5' />
              <span className='eyebrow eyebrow--plain'>collaboration scope</span>
            </div>
            <p className='text-muted-foreground text-base leading-7 sm:text-lg sm:leading-8'>
              当前已验证版本分支、撤销重做、条件同步与跨 Tab 同步。CRDT 多人实时协同、权限系统与托管云服务不在当前能力范围内。
            </p>
            <div className='mt-6 flex flex-wrap gap-2'>
              {['Version branching', 'Undo / redo', 'Conditional sync', 'Cross-tab sync'].map(tag => (
                <span key={tag} className='mono-chip'>
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </motion.div>
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
                <div className='flex flex-col gap-8 md:flex-row md:items-center md:justify-between'>
                  <div>
                    <h2 className='text-foreground mt-4 text-3xl font-semibold tracking-tight sm:text-4xl'>
                      用在线演示验证关键场景
                    </h2>
                    <p className='text-muted-foreground mt-4 text-base leading-7'>
                      重点观察查询结果如何更新、关系数据如何组织，以及同一模型在三套框架中的绑定差异。
                    </p>
                  </div>
                </div>
                <Button asChild size='lg'>
                  <Link to='/demos'>
                    打开在线演示
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

export default function ComparisonPage(): ReactNode {
  return (
    <Layout title='适用场景' description='根据本地数据库、响应式查询与跨框架模型需求，判断 RxDB 是否适合当前项目'>
      <ComparisonContent />
    </Layout>
  );
}
