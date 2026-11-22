import { DemoMicroApp } from '@site/src/components/DemoMicroApp';
import { useSiteCopy } from '@site/src/lib/locale-copy';
import Layout from '@theme/Layout';

export default function BenchmarksPage() {
  const copy = useSiteCopy();
  return (
    <Layout title={copy('基准测试')} description={copy('在独立运行的基准测试应用中查看 RxDB 的实时测试结果')}>
      <DemoMicroApp
        name='rxdb-benchmarks'
        url='/benchmarks-app/'
        title={copy('RxDB 基准测试')}
        allow='cross-origin-isolated'
      />
    </Layout>
  );
}
