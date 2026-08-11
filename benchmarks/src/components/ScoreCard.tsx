import { computeScoreReport } from '../analysis/score-engine';
import type { BenchmarkSection } from '../hooks/useBenchmark';

interface ScoreCardProps {
  sections: BenchmarkSection[];
}

const GRADE_CLASS: Record<string, { badge: string; text: string }> = {
  S: { badge: 'badge-success', text: 'text-success' },
  A: { badge: 'badge-primary', text: 'text-primary' },
  B: { badge: 'badge-info', text: 'text-info' },
  C: { badge: 'badge-warning', text: 'text-warning' },
  D: { badge: 'badge-error', text: 'text-error' }
};

const GRADE_LABEL: Record<string, string> = {
  S: '出色',
  A: '优秀',
  B: '良好',
  C: '及格',
  D: '待优化'
};

const SCORE_TIERS = [
  { min: 90, suffix: 'success' },
  { min: 75, suffix: 'primary' },
  { min: 60, suffix: 'info' },
  { min: 40, suffix: 'warning' },
  { min: -Infinity, suffix: 'error' }
] as const;

function tierFor(score: number): (typeof SCORE_TIERS)[number] {
  return SCORE_TIERS.find(t => score >= t.min) ?? SCORE_TIERS[SCORE_TIERS.length - 1];
}

function scoreTextClass(score: number): string {
  return `text-${tierFor(score).suffix}`;
}

function progressClass(score: number): string {
  return `progress-${tierFor(score).suffix}`;
}

export function ScoreCard({ sections }: ScoreCardProps) {
  const report = computeScoreReport(sections);
  if (!report) return null;

  const gc = GRADE_CLASS[report.grade];

  return (
    <div className='card'>
      <div className='card-body'>
        <div className='mb-6 flex items-center justify-between gap-4'>
          <div>
            <div className='mono mb-2 text-[10px] tracking-[0.18em] uppercase opacity-60'>// aggregate score</div>
            <h3 className='text-xl font-semibold tracking-tight'>综合性能评分</h3>
          </div>
          <span className='mono-chip mono-chip--primary'>0 – 100</span>
        </div>

        <div className='mt-2 flex flex-col gap-8 sm:flex-row sm:items-center'>
          {/* Total score + grade */}
          <div className='flex shrink-0 flex-col items-center gap-3 border-r border-[color:color-mix(in_oklab,var(--color-base-content)_10%,transparent)] pr-8 sm:pr-12'>
            <div className='mono text-[10px] tracking-[0.2em] uppercase opacity-50'>total</div>
            <div
              className={`text-7xl leading-none font-semibold tracking-tight tabular-nums ${scoreTextClass(report.total)}`}
            >
              {report.total.toFixed(1)}
            </div>
            <div className='mono text-[10px] tracking-[0.18em] uppercase opacity-40'>/ 100</div>
            <div className={`badge badge-outline badge-lg px-4 py-3 text-base font-bold ${gc.badge} ${gc.text}`}>
              {report.grade}&nbsp;
              <span className='ml-1 text-xs font-medium opacity-70'>{GRADE_LABEL[report.grade]}</span>
            </div>
          </div>

          {/* Category breakdown */}
          <div className='w-full flex-1 space-y-5'>
            {report.categories.map(cat => (
              <div key={cat.key}>
                <div className='mb-1.5 flex items-center justify-between'>
                  <span className='text-sm font-medium'>
                    {cat.title}
                    <span className='mono ml-2 text-[10px] tracking-[0.16em] uppercase opacity-50'>
                      w / {cat.weight}%
                    </span>
                  </span>
                  <span className={`text-sm font-semibold tabular-nums ${scoreTextClass(cat.score)}`}>
                    {cat.score.toFixed(1)}
                  </span>
                </div>
                <progress
                  className={`progress h-1.5 w-full ${progressClass(cat.score)}`}
                  value={cat.score}
                  max={100}
                  aria-label={`${cat.title} 得分 ${cat.score.toFixed(1)}`}
                />
              </div>
            ))}
          </div>
        </div>

        <p className='mono mt-6 text-[10px] tracking-[0.14em] uppercase opacity-40'>
          weight · latency 35 / throughput 30 / scalability 20 / concurrency 15 · piecewise-linear → 0–100
        </p>
      </div>
    </div>
  );
}
