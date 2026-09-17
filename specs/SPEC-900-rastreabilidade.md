# SPEC-900 — Matriz de Rastreabilidade

Cada requisito das especificações é ligado ao código que o implementa e ao teste
que o verifica. É este documento que sustenta a afirmação central do SDD:
**nenhum código existe sem uma especificação que o justifique.**

## Requisitos funcionais

| Requisito | Implementação | Verificação |
|---|---|---|
| RF-001 Registro | `src/routes/auth.ts` | `tests/auth.test.ts` — "RF-001" |
| RF-002 Login | `src/routes/auth.ts` | `tests/auth.test.ts` — "RF-002" |
| RF-003 Validação de cadastro | `src/lib/schemas.ts` | `tests/auth.test.ts` — "RF-003" |
| RF-004 Usuário corrente | `src/routes/auth.ts` | `tests/auth.test.ts` — "RS-003" |
| RF-010 Listar tarefas | `src/routes/tasks.ts`, `src/lib/database.ts` | `tests/tasks.test.ts` — "RF-010" |
| RF-011 Criar tarefa | `src/routes/tasks.ts` | `tests/tasks.test.ts` — "RF-011" |
| RF-012 Obter tarefa | `src/routes/tasks.ts` | `tests/tasks.test.ts` — "RF-012 / RF-013 / RF-015" |
| RF-013 Atualizar tarefa | `src/routes/tasks.ts` | `tests/tasks.test.ts` — idem |
| RF-014 Validação de tarefas | `src/lib/schemas.ts` | `tests/tasks.test.ts` — "RF-014" |
| RF-015 Remover tarefa | `src/routes/tasks.ts` | `tests/tasks.test.ts` — idem |
| RF-020 Health check | `src/app.ts` | `tests/operacao.test.ts` — "RF-020" |
| RF-021 Configuração | `src/config.ts` | `tests/config.test.ts` |
| RF-022 Encerramento gracioso | `src/server.ts` | verificação manual |
| RF-023 Infraestrutura como código | `infra/*.tf` | `terraform validate` |
| RF-024 Estratégia de implantação | `scripts/deploy.sh` | execução da pipeline |

## Requisitos de segurança

| Requisito | Implementação | Verificação |
|---|---|---|
| RS-001 Hash de senha | `src/lib/security.ts` | `tests/auth.test.ts` — CA-001.1 |
| RS-002 Emissão de token | `src/lib/security.ts`, `src/config.ts` | `tests/config.test.ts`, `tests/auth.test.ts` |
| RS-003 Verificação de token | `src/middleware/authenticate.ts` | `tests/auth.test.ts` — "RS-003" |
| RS-004 Anti-enumeração | `src/routes/auth.ts` | `tests/auth.test.ts` — "RS-004" |
| RS-005 Autorização de objeto (BOLA) | `src/lib/database.ts`, `src/routes/tasks.ts` | `tests/tasks.test.ts` — "RS-005" |
| RS-006 Anti-atribuição em massa | `src/lib/schemas.ts`, `src/routes/tasks.ts` | `tests/tasks.test.ts` — CA-002.2 |
| RS-007 Anti-injeção de SQL | `src/lib/database.ts` | `tests/tasks.test.ts` — "RS-007" |
| RS-008 Validação de entrada | `src/lib/schemas.ts`, `src/app.ts` | todos os arquivos de teste |
| RS-009 Cabeçalhos HTTP | `src/app.ts` | `tests/operacao.test.ts` — "RS-009" |
| RS-010 Limitação de taxa | `src/app.ts` | verificação manual |
| RS-011 Erros sem vazamento | `src/middleware/errorHandler.ts` | `tests/operacao.test.ts` — "RS-011" |
| RS-012 Registro de eventos | `src/lib/logger.ts` | inspeção do código |
| RS-013 Container sem privilégios | `Dockerfile` | inspeção do código |
| RS-014 Cadeia de suprimentos | `.github/workflows/pipeline.yml` | execução da pipeline |
| RS-015 Gestão de segredos | `.gitignore`, GitHub Secrets | inspeção do repositório |
| RS-016 Portão da pipeline | `.github/workflows/pipeline.yml` | execução da pipeline |

## Cobertura

75 casos de teste automatizados, todos aprovados. A cobertura é publicada como
artefato da pipeline e enviada ao SonarCloud.

## Defeitos encontrados pelo processo

Registro dos casos em que a especificação apontou divergência na implementação —
evidência de que o processo SDD funcionou:

| # | Divergência | Requisito | Detectado por | Correção |
|---|---|---|---|---|
| 1 | Helmet emitia `X-Frame-Options: SAMEORIGIN`; a spec exige `DENY` | RS-009 | Teste automatizado | `frameguard: { action: 'deny' }` em `src/app.ts` |
| 2 | Corpo acima do limite produzia 500 em vez de 4xx | RS-008, RS-011 | Teste automatizado | Tratamento dos erros do interpretador de corpo em `src/middleware/errorHandler.ts` |
| 3 | `express` 4.21.1 arrastava `path-to-regexp` com ReDoS de severidade alta ([GHSA-rhx6-c78j-4q9w](https://github.com/advisories/GHSA-rhx6-c78j-4q9w)), além de `qs` e `body-parser` com DoS moderado | RS-014 | **Pipeline — `npm audit`** | Atualização para `express` 4.22.3 |

### Sobre o defeito nº 3

Este caso é a demonstração prática de RS-016. A vulnerabilidade não estava no
código escrito para esta atividade, mas em uma dependência transitiva — o tipo
de falha que a revisão manual de código não encontra.

A sequência observada na execução da pipeline foi:

1. `build-test` — os 75 testes passaram; o `npm audit` reprovou o build.
2. `security-scan` — **não executou** (`needs: build-test`).
3. `deploy` — **não executou**.

Ou seja, o portão funcionou como especificado: uma vulnerabilidade de
severidade alta impediu que a versão chegasse à internet. Nenhuma ação manual
foi necessária para bloquear a publicação.
