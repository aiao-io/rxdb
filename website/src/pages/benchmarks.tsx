import { DemoMicroApp } from '@site/src/components/DemoMicroApp';
import Layout from '@theme/Layout';

export default function BenchmarksPage() {
  return (
    <Layout title='基准测试' description='在独立运行的基准测试应用中查看 RxDB 的实时测试结果'>
      <DemoMicroApp name='rxdb-benchmarks' url='/benchmarks-app/' title='RxDB 基准测试' allow='cross-origin-isolated' />
    </Layout>
  );
}
