import { DemoMicroApp } from '@site/src/components/DemoMicroApp';
import { useSiteCopy } from '@site/src/lib/locale-copy';
import Layout from '@theme/Layout';

export default function ReactDemoPage() {
  const copy = useSiteCopy();
  return (
    <Layout
      title={copy('React 演示')}
      description={copy('查看 RxDB 在 React 中的查询、实体详情、代码编辑器与分支管理实现')}
    >
      <DemoMicroApp name='rxdb-demo-react' url='/demo/react/' title={copy('React 演示')} basePath='/demos/react' />
    </Layout>
  );
}
