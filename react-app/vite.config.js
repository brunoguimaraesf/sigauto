import { defineConfig, configDefaults } from 'vitest/config'
import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { relatarEFalhar, verificarDiretorio } from './scripts/verifica-bundle.mjs'

// Verificar um caminho fixo era furo: `vite build --outDir build` publicava
// `build/` e a checagem olhava a `dist/` antiga, limpa, e aprovava. Como plugin,
// a verificacao recebe o diretorio que o build acabou de escrever, entao
// acompanha qualquer `outDir` e roda em TODO `vite build` — inclusive se o
// Build Command do painel da Vercel ignorar o script do package.json.
function verificaDemoLogin() {
  let saida = 'dist'
  return {
    name: 'sigauto-verifica-demo-login',
    apply: 'build',
    configResolved(config) {
      // `config.build.outDir` chega relativo, e o Vite o escreve relativo a
      // `config.root`. Resolver contra o cwd inspecionava outro diretorio
      // quando o build e invocado de fora (`npx vite build react-app`): com um
      // `dist/` limpo no cwd, aprovava o diretorio errado.
      saida = resolve(config.root, config.build.outDir)
    },
    closeBundle() {
      const resultado = verificarDiretorio(saida)
      if (!relatarEFalhar(resultado, saida)) {
        this.error('Credencial de demonstracao no artefato de build. Veja scripts/verifica-bundle.mjs.')
      }
    },
  }
}

// https://vite.dev/config/
// `import.meta.env.DEV` NAO serve para esconder segredo: o Vite o deriva de
// NODE_ENV, e `NODE_ENV=development npx vite build` produz um bundle de
// producao com DEV === true — medido, as senhas de demonstracao reapareceram no
// artefato. Este projeto tem NODE_ENV=development setado em producao, entao o
// risco e concreto. A bandeira abaixo depende do COMANDO: `serve` (vite dev e
// vitest) habilita; qualquer `build` desabilita, inclusive com --mode
// development ou NODE_ENV adulterado.
export default defineConfig(({ command, mode }) => ({
  define: {
    // `command` nao responde ao DESTINO: `vite dev --mode production`, `vercel
    // dev` ou um dev server exposto por tunel ainda sao `serve`. O modo entra
    // na conta para que servir producao nunca habilite o painel de demo.
    __DEMO_LOGIN__: JSON.stringify(command === 'serve' && mode !== 'production'),
  },
  plugins: [react(), verificaDemoLogin()],
  test: {
    // Ambiente padrão node (rápido) para os testes de função pura.
    // Os testes de componente declaram jsdom via "// @vitest-environment jsdom".
    setupFiles: ['./src/test/setup.js'],
    exclude: [...configDefaults.exclude, 'e2e/**'],
  },
}))
