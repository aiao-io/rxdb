import { Award, BarChart3, ClipboardList, Clock, Database, Gauge, GitBranch, TrendingUp } from 'lucide-react';
import { Fragment } from 'react';
import type { BenchmarkSection } from '../hooks/useBenchmark';
import { formatDuration, formatMemory, getDurationColorClass } from '../utils/performance';

interface BenchmarkResultsProps {
  sections: BenchmarkSection[];
}

const iconMap = {
  throughput: TrendingUp,
  latency: BarChart3,
  scalability: Gauge,
  concurrency: GitBranch
};

function TableHeader() {
  return (
    <thead>
      <tr>
        <th className='w-2/5' scope='col'>
          <div className='flex items-center gap-2'>
            <ClipboardList size={12} />
            测试场景
          </div>
        </th>
        <th className='text-right' scope='col'>
          <div className='flex items-center justify-end gap-2'>
            <Clock size={12} />
            耗时 (ms)
          </div>
        </th>
        <th className='text-right' scope='col'>
          <div className='flex items-center justify-end gap-2'>
            <Database size={12} />
            内存 (MB)
          </div>
        </th>
        <th scope='col'>
          <div className='flex items-center gap-2'>
            <Award size={12} />
            详情备注
          </div>
        </th>
      </tr>
    </thead>
  );
}

export function BenchmarkResults({ sections }: BenchmarkResultsProps) {
  if (sections.length === 0) {
    return (
      <div className='overflow-x-auto'>
        <table className='table' aria-label='性能测试结果'>
          <TableHeader />
          <tbody aria-atomic='true' aria-live='polite'>
            <tr>
              <td className='py-16 text-center' colSpan={4}>
                <div className='flex flex-col items-center gap-4'>
                  <div className='data-cube' style={{ width: '2.25rem', height: '2.25rem' }} />
                  <div className='mono text-[10px] tracking-[0.22em] uppercase opacity-50'>awaiting run · idle</div>
                  <span className='text-sm opacity-50'>点击右上角「开始测试」运行性能基准测试</span>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className='overflow-x-auto'>
      <table className='table' aria-label='性能测试结果'>
        <TableHeader />
        <tbody>
          {sections.map((section, idx) => {
            const Icon = iconMap[section.icon as keyof typeof iconMap] || TrendingUp;
            return (
              <Fragment key={section.title}>
                <tr className='section-header'>
                  <td colSpan={4}>
                    <div className='flex items-center gap-3'>
                      <span className='mono-chip mono-chip--primary'>
                        <Icon size={12} />
                        {String(idx + 1).padStart(2, '0')}
                      </span>
                      <span className='text-primary font-semibold tracking-tight'>{section.title}</span>
                    </div>
                  </td>
                </tr>
                {section.results.map(result => {
                  const durationClass = `text-right tabular-nums ${getDurationColorClass(result.duration)}`;

                  return (
                    <tr key={`${section.title}-${result.name}`}>
                      <td className='font-medium'>{result.name}</td>
                      <td className={durationClass}>{formatDuration(result.duration)}</td>
                      <td className='text-right tabular-nums opacity-70'>
                        {result.memory ? formatMemory(result.memory) : '—'}
                      </td>
                      <td className='text-xs opacity-60'>{result.extra || '—'}</td>
                    </tr>
                  );
                })}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
