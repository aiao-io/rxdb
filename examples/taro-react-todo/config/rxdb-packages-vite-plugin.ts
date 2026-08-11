import { transformAsync } from '@babel/core'
import type { Plugin } from 'vite'

function isLinkedPackageDist(id: string): boolean {
  const cleanId = id.split('?')[0]
  return cleanId.includes('/packages/') && cleanId.includes('/dist/') && cleanId.endsWith('.js')
}

export function rxdbPackagesVitePlugin(): Plugin {
  return {
    name: 'taro-react-todo:rxdb-private-members',
    enforce: 'pre',
    async transform(code, id) {
      if (!isLinkedPackageDist(id) || !code.includes('#')) return null
      const result = await transformAsync(code, {
        babelrc: false,
        configFile: false,
        filename: id.split('?')[0],
        plugins: [
          ['@babel/plugin-transform-class-properties', { loose: true }],
          ['@babel/plugin-transform-private-methods', { loose: true }]
        ],
        sourceMaps: true,
        sourceType: 'module'
      })
      if (!result?.code) return null
      return { code: result.code, map: result.map }
    }
  }
}

export function rxdbBuildTargetVitePlugin(): Plugin {
  return {
    name: 'taro-react-todo:rxdb-es2020-target',
    enforce: 'post',
    config() {
      return { build: { target: 'es2020' } }
    }
  }
}
