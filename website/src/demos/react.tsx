import { DemoMicroApp } from '@site/src/components/DemoMicroApp';
import Layout from '@theme/Layout';

export default function ReactDemoPage() {
  return (
    <Layout title='React 演示' description='查看 RxDB 在 React 中的查询、实体详情、代码编辑器与分支管理实现'>
      <DemoMicroApp name='rxdb-demo-react' url='/demo/react/' title='React 演示' basePath='/demos/react' />
    </Layout>
  );
}
