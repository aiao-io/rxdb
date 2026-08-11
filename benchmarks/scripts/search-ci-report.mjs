const median = values => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

const assertCompatibleLayouts = reports => {
  const expected = reports[0];
  if (!expected) {
    throw new Error('cannot aggregate an empty benchmark report list');
  }

  const metricKeys = Object.keys(expected.metrics);
  for (const report of reports.slice(1)) {
    const compatibleMetrics = Object.keys(report.metrics).join('\0') === metricKeys.join('\0');
    const compatibleSections = expected.sections.every((section, sectionIndex) => {
      const candidate = report.sections[sectionIndex];
      return (
        candidate?.id === section.id &&
        candidate.metrics.length === section.metrics.length &&
        section.metrics.every((metric, metricIndex) => candidate.metrics[metricIndex]?.id === metric.id)
      );
    });

    if (!compatibleMetrics || report.sections.length !== expected.sections.length || !compatibleSections) {
      throw new Error('benchmark report layout changed between attempts');
    }
  }
};

export const aggregateBenchmarkReports = reports => {
  assertCompatibleLayouts(reports);
  const first = reports[0];
  const metricKeys = Object.keys(first.metrics);
  const metrics = Object.fromEntries(metricKeys.map(key => [key, median(reports.map(report => report.metrics[key]))]));
  const sections = first.sections.map((section, sectionIndex) => ({
    ...section,
    metrics: section.metrics.map((metric, metricIndex) => {
      const values = reports.map(report => report.sections[sectionIndex].metrics[metricIndex].value);
      return {
        ...metric,
        value: median(values),
        extra: `attempts=${values.map(value => `${value.toFixed(2)}ms`).join(', ')}`
      };
    })
  }));

  return {
    ...first,
    aggregation: 'median',
    attemptCount: reports.length,
    attempts: reports.map(report => ({ ...report.metrics })),
    sections,
    metrics
  };
};
