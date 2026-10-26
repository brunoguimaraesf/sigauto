// Validação estrutural e execução dos scripts Postman com exemplos fictícios.
// Usa somente módulos nativos; não acessa rede nem credenciais locais.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const raiz = path.resolve(__dirname, '../..')
const colecao = JSON.parse(fs.readFileSync(path.join(__dirname, 'SIGAuto.postman_collection.json'), 'utf8'))
assert.equal(colecao.info.schema, 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json')
assert.equal(colecao.auth.type, 'noauth')
const variaveis = Object.fromEntries(colecao.variable.map(({ key, value }) => [key, value]))
assert.equal(variaveis.baseUrl, 'http://localhost:3001')
assert.equal(variaveis.habilitarEfeitos, 'nao')
for (const [nome, valor] of Object.entries(variaveis)) {
  if (!['baseUrl', 'habilitarEfeitos'].includes(nome)) assert.equal(valor, '', nome)
}

const esperados = new Set(['GET /health'])
for (const grupo of ['auth', 'chatbot', 'ia']) {
  const fonte = fs.readFileSync(path.join(raiz, `backend/src/routes/${grupo}Routes.js`), 'utf8')
  for (const [, metodo, rota] of fonte.matchAll(/router\.(get|post|patch|put|delete)\('([^']+)'/g)) {
    esperados.add(`${metodo.toUpperCase()} /api/v1/${grupo}${rota}`)
  }
}
const normalizar = pedido => `${pedido.method} ${pedido.url.replace('{{baseUrl}}', '').split('?')[0].replace(/\/usuarios\/[^/]+$/, '/usuarios/:id')}`
const requisicoes = colecao.item.flatMap(pasta => pasta.item)
const cobertos = new Set()
let scripts = 0
let verificacoes = 0
let bloqueadas = 0
const ignorada = Symbol('requisição ignorada')

function executar(item, codigo, corpo, valores = {}, evento = 'test') {
  const capturadas = {}
  const contexto = {
    console: { info() {} },
    pm: {
      variables: { get: chave => valores[chave] },
      collectionVariables: { set: (chave, valor) => { capturadas[chave] = valor } },
      execution: { skipRequest: () => { throw ignorada } },
      response: { code: codigo, json: () => structuredClone(corpo), to: { have: { status: esperado => assert.equal(codigo, esperado) } } },
      test: (_nome, teste) => { teste(); verificacoes++ },
      expect: valor => ({ to: { equal: esperado => assert.equal(valor, esperado) } }),
    },
  }
  for (const entrada of item.event.filter(e => e.listen === evento)) {
    vm.runInNewContext(entrada.script.exec.join('\n'), contexto, { timeout: 1000 })
  }
  return capturadas
}

for (const item of requisicoes) {
  assert.ok(item.name)
  assert.ok(esperados.has(normalizar(item.request)), item.name)
  assert.equal(item.response.length, 1)
  const exemplo = item.response[0]
  const corpo = JSON.parse(exemplo.body)
  assert.equal(typeof exemplo.code, 'number')
  if (exemplo.code < 300) cobertos.add(normalizar(item.request))
  for (const evento of item.event) {
    assert.ok(['test', 'prerequest'].includes(evento.listen))
    new vm.Script(evento.script.exec.join('\n'))
    scripts++
  }
  const capturadas = executar(item, exemplo.code, corpo)
  if (item.name.startsWith('Login do gestor') || item.name.startsWith('Renovar sessão')) {
    assert.equal(capturadas.tokenGestor, corpo.dados.token)
    assert.equal(capturadas.refreshToken, corpo.dados.refresh_token)
  }
  if (item.name.startsWith('Criar usuário')) assert.equal(capturadas.idUsuarioTeste, corpo.dados.usuario.id)
  if (item.name.startsWith('Logout')) {
    assert.equal(capturadas.tokenGestor, '')
    assert.equal(capturadas.refreshToken, '')
  }
  assert.throws(() => executar(item, 599, corpo), undefined, `${item.name}: HTTP incorreto deve falhar`)
  if (Object.hasOwn(corpo, 'erro')) {
    assert.throws(() => executar(item, exemplo.code, { ...corpo, erro: !corpo.erro }), undefined, `${item.name}: envelope incorreto deve falhar`)
  }
  if (exemplo.code >= 400) {
    assert.throws(() => executar(item, exemplo.code, { ...corpo, codigo: 'CODIGO_INCORRETO' }), undefined, `${item.name}: código de erro incorreto deve falhar`)
  }
  if (corpo.paginacao) {
    assert.throws(() => executar(item, exemplo.code, {
      ...corpo,
      paginacao: { ...corpo.paginacao, totalPaginas: 999 },
    }), undefined, `${item.name}: paginação inconsistente deve falhar`)
    if (item.request.url.includes('/ia/recomendacoes')) {
      for (const registro of [{ id_usuario: 'identidade-ficticia' }, { recomendacoes: { metricas_do_modelo: {} } }]) {
        assert.throws(() => executar(item, exemplo.code, { ...corpo, dados: [registro] }), undefined, `${item.name}: campo privado deve falhar`)
      }
    }
  }
  const pre = item.event.find(e => e.listen === 'prerequest')
  if (pre) {
    assert.throws(() => executar(item, exemplo.code, corpo, variaveis, 'prerequest'), e => e === ignorada)
    const preenchidas = Object.fromEntries(Object.keys(variaveis).map(chave => [chave, 'valor-ficticio']))
    preenchidas.habilitarEfeitos = 'sim'
    executar(item, exemplo.code, corpo, preenchidas, 'prerequest')
    if (pre.script.exec.some(linha => linha.includes("get('habilitarEfeitos')"))) {
      assert.throws(() => executar(item, exemplo.code, corpo, { ...preenchidas, habilitarEfeitos: 'nao' }, 'prerequest'), e => e === ignorada)
      bloqueadas++
    }
  }
}
assert.deepEqual([...cobertos].sort(), [...esperados].sort())
assert.equal(requisicoes.length, 33)
assert.equal(bloqueadas, 8)
console.log(`JSON válido; ${cobertos.size}/${esperados.size} endpoints; ${requisicoes.length} requisições; ${scripts} scripts compilados.`)
console.log(`${verificacoes} assertions executadas sobre exemplos e casos inválidos; ${bloqueadas} operações com efeitos bloqueadas por padrão.`)
console.log('Validação local sem rede; nenhuma chamada real ao backend foi executada.')
