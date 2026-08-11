import { runSearchBenchmark } from './suites/rxdb-plugin-search.bench';

declare global {
  interface Window {
    __searchBenchReport?: Awaited<ReturnType<typeof runSearchBenchmark>>;
    __searchBenchError?: string;
  }
}

void runSearchBenchmark()
  .then(report => {
    window.__searchBenchReport = report;
  })
  .catch(error => {
    const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    window.__searchBenchError = message;
    console.error(message);
  });
