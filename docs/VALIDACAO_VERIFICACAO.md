# Plano de Verificação e Validação (V&V) — SIGAuto

TFC UniRV 2026 · Bruno Gabriel Guimarães Fernandes

## 1. Conceitos

- **Verificação** — "construímos o produto **do jeito certo**?" Conformidade técnica:
  o código atende à especificação, está livre de defeitos e compila/executa.
- **Validação** — "construímos o **produto certo**?" Conformidade com os requisitos
  e a necessidade real do usuário da oficina.

## 2. Ferramentas de Verificação

| Ferramenta | Uso | Situação |
|---|---|---|
| **Vitest** | Testes unitários (frontend e backend) | **Implementado — 36 testes** |
| **ESLint** | Análise estática de código | Configurado (`npm run lint`) |
| **Vite build** | Verificação de compilação/empacotamento | `npm run build` |
| **QA assistido em navegador** | Inspeção de telas, console e fluxos | Realizado (evidências em prints) |
| **Playwright** (ou Cypress) | Testes ponta a ponta (E2E) dos fluxos | Planejado |
| **Postman/Insomnia** | Testes da API REST (endpoints) | Planejado |

### 2.1 Testes automatizados (Vitest)

- **Backend** — `backend/src/utils/validators.test.js`: validação de CPF, CNPJ,
  placa (formatos antigo e Mercosul), e-mail e senha. **18 testes.**
- **Frontend** — `react-app/src/utils/*.test.js`:
  - `placa.test.js` — normalização e formatação de placa.
  - `estoque.test.js` — regra de alerta de reposição, cálculo de saldo, formatação monetária.
  - `chatbot.test.js` — roteamento de respostas, incluindo **teste de regressão** de um
    defeito real corrigido (pergunta sobre estoque não deve cair na resposta de OS).
  - **18 testes.**
- **Total: 36 testes, 100% passando.**
- **Como executar:** `npm test` dentro de `backend/` e de `react-app/`.

## 3. Ferramentas de Validação

| Ferramenta | Uso |
|---|---|
| **Matriz de rastreabilidade** | Liga cada requisito/caso de uso à funcionalidade e ao teste (seção 4) |
| **Testes de aceitação (UAT)** | Critérios de aceite verificados por caso de uso |
| **Questionário SUS** (System Usability Scale) | Avaliação de usabilidade com usuários/orientador |
| **Validação em ambiente hospedado** | Orientador testa o sistema publicado (Vercel) |

## 4. Matriz de Rastreabilidade de Requisitos

| UC | RF | Funcionalidade | Implementação | Status | Verificação/Validação |
|---|---|---|---|---|---|
| UC01 | RF08 | Autenticar usuário (login + perfil) | Login, AuthContext, authMiddleware, RLS | Implementado | Teste de login por perfil + RLS |
| UC02 | RF01 | Manter clientes | Clientes.jsx | Implementado | Teste unitário + UAT |
| UC03 | RF02 | Manter veículos (vínculo a cliente) | Veiculos.jsx + utils/placa | Implementado | Teste unitário (placa) + E2E |
| UC04 | RF03 | Abrir ordem de serviço | OrdemServico/AbrirOS | Implementado | Teste E2E + aceitação |
| UC05 | RF04 | Atualizar ordem de serviço | OrdemServico/AtualizarOS | Implementado | Teste E2E + aceitação |
| UC06 | RF05 | Encerrar ordem de serviço | OrdemServico/EncerrarOS | Implementado | Teste E2E + aceitação |
| UC07 | RF06 | Consultar histórico | Historico.jsx | Implementado | Teste funcional |
| UC08 | RF07 | Emitir relatórios (exportação) | Relatorios.jsx (CSV/PDF/XLSX) | Implementado | Teste funcional + validação de export |
| UC09 | RF09 | Manter estoque (alertas) | Estoque/ListaEstoque + utils/estoque | Implementado | Teste unitário (alerta) |
| UC10 | RF12 | Manter serviços | Servicos.jsx | Implementado | Teste unitário + UAT |
| UC11 | RF10 | Movimentar estoque (entrada/saída) | movimentacao_estoque + utils/estoque | Implementado | Teste unitário (saldo) |
| UC12 | RF11 | Responder via chatbot | Chatbot + backend (Gemini) | Implementado | Teste unitário (roteamento) + API |
| UC13 | RF13 | Gerar recomendações da IA | PainelIA + iaController (Gemini) | Implementado | Teste de API + validação com orientador |

> Observação: o UC13 usa a API do **Google Gemini** (modelo pré-treinado). Não há
> treinamento de modelo — as recomendações são geradas a partir dos dados reais da
> oficina enviados como contexto, o que torna o caso de uso plenamente executável.
>
> Ajuste a numeração de RF (UC10/UC13) conforme o documento oficial de requisitos.

## 5. Como executar os testes

```bash
# Backend
cd backend && npm test

# Frontend
cd react-app && npm test
```

Saída esperada: 36 testes aprovados (18 backend + 18 frontend).
