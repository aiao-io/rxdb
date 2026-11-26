import { useI18n } from '@aiao/rxdb-i18n-react';
import { computeScoreReport } from '../analysis/score-engine';
import type { BenchmarkSection } from '../hooks/useBenchmark';
import type { BenchmarksMessageKey } from '../i18n/messages';

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

const GRADE_LABEL: Record<string, BenchmarksMessageKey> = {
  S: 'score.gradeS',
  A: 'score.gradeA',
  B: 'score.gradeB',
  C: 'score.gradeC',
  D: 'score.gradeD'
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
  const { t } = useI18n();
  const report = computeScoreReport(sections);
  if (!report) return null;

  const gc = GRADE_CLASS[report.grade];

  return (
    <div className='card'>
      <div className='card-body'>
        <div className='mb-6 flex items-center justify-between gap-4'>
          <div>
            <div className='mono mb-2 text-[10px] tracking-[0.18em] uppercase opacity-60'>
              {t('score.aggregateComment')}
            </div>
            <h3 className='text-xl font-semibold tracking-tight'>{t('score.title')}</h3>
          </div>
          <span className='mono-chip mono-chip--primary'>{t('score.range')}</span>
        </div>

        <div className='mt-2 flex flex-col gap-8 sm:flex-row sm:items-center'>
          {/* Total score + grade */}
          <div className='flex shrink-0 flex-col items-center gap-3 border-r border-[color:color-mix(in_oklab,var(--color-base-content)_10%,transparent)] pr-8 sm:pr-12'>
            <div className='mono text-[10px] tracking-[0.2em] uppercase opacity-50'>{t('score.total')}</div>
            <div
              className={`text-7xl leading-none font-semibold tracking-tight tabular-nums ${scoreTextClass(report.total)}`}
            >
              {report.total.toFixed(1)}
            </div>
            <div className='mono text-[10px] tracking-[0.18em] uppercase opacity-40'>{t('score.overHundred')}</div>
            <div className={`badge badge-outline badge-lg px-4 py-3 text-base font-bold ${gc.badge} ${gc.text}`}>
              {report.grade}&nbsp;
              <span className='ml-1 text-xs font-medium opacity-70'>{t(GRADE_LABEL[report.grade])}</span>
            </div>
          </div>

          {/* Category breakdown */}
          <div className='w-full flex-1 space-y-5'>
            {report.categories.map(cat => {
              const title = t(cat.titleKey);
              return (
                <div key={cat.key}>
                  <div className='mb-1.5 flex items-center justify-between'>
                    <span className='text-sm font-medium'>
                      {title}
                      <span className='mono ml-2 text-[10px] tracking-[0.16em] uppercase opacity-50'>
                        {t('score.weightLabel', { weight: cat.weight })}
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
                    aria-label={t('score.categoryAria', { category: title, score: cat.score.toFixed(1) })}
                  />
                </div>
              );
            })}
          </div>
        </div>

        <p className='mono mt-6 text-[10px] tracking-[0.14em] uppercase opacity-40'>{t('score.weightFootnote')}</p>
      </div>
    </div>
  );
}
