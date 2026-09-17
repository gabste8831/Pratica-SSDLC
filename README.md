# SecureTasks

API REST de gerenciamento de tarefas desenvolvida com **Spec-Driven Development
(SDD)** e um ciclo de vida de desenvolvimento seguro (SSDLC) completo: da
especificação escrita antes do código à publicação automatizada na AWS, com
análise estática de segurança bloqueando o deploy.

Disciplina de Auditoria e Segurança de Sistemas — 8ª fase.

---

## Entregáveis da atividade

| # | Item exigido | Onde está |
|---|---|---|
| 1 | Repositório no GitHub | este repositório |
| 2 | Sistema desenvolvido com SDD | [`specs/`](specs/) — 6 especificações; rastreabilidade em [SPEC-900](specs/SPEC-900-rastreabilidade.md) |
| 3 | Ambiente na AWS | [`infra/`](infra/) — Terraform provisionando EC2 |
| 4 | Pipeline de CI/CD | [`.github/workflows/pipeline.yml`](.github/workflows/pipeline.yml) |
| 5 | Scanner de segurança no deploy | SonarCloud + Quality Gate bloqueante, e `npm audit` |
| 6 | Aplicação publicada na internet | `http://<ip-da-ec2>/health` ao fim da pipeline |

---

## 1. O método: Spec-Driven Development

O fluxo obrigatório neste repositório é:

```
  SPEC escrita  →  Teste que cita o ID da SPEC  →  Código que faz o teste passar
```

Consequências práticas adotadas:

- Todo código rastreia até um requisito `RF-*` (funcional) ou `RS-*` (segurança).
- Todo requisito verificável tem um teste que menciona seu ID no nome.
- A spec é a fonte da verdade: divergência é defeito da implementação.

### Especificações

| ID | Documento | Conteúdo |
|---|---|---|
| SPEC-000 | [Visão geral](specs/SPEC-000-visao-geral.md) | Propósito, método SDD, escopo |
| SPEC-001 | [Autenticação](specs/SPEC-001-autenticacao.md) | Registro, login, validação |
| SPEC-002 | [Tarefas](specs/SPEC-002-tarefas.md) | CRUD e isolamento por usuário |
| SPEC-003 | [Segurança](specs/SPEC-003-seguranca.md) | 16 requisitos `RS-*` + modelo STRIDE |
| SPEC-004 | [Operação](specs/SPEC-004-operacao.md) | Health check, deploy, pipeline |
| SPEC-900 | [Rastreabilidade](specs/SPEC-900-rastreabilidade.md) | Matriz requisito → código → teste |

> **O processo funcionou:** a execução dos testes revelou duas divergências
> entre a implementação e a especificação — cabeçalho `X-Frame-Options`
> incorreto e erro 500 onde a spec exigia 4xx. Ambas estão registradas no fim da
> SPEC-900 com suas correções.

---

## 2. Segurança aplicada

A [SPEC-003](specs/SPEC-003-seguranca.md) define 16 requisitos de segurança
mapeados ao OWASP Top 10 e ao OWASP API Security Top 10. Destaques:

| Requisito | Medida | Ameaça mitigada |
|---|---|---|
| RS-001 | bcrypt com fator de custo 12 | A02 — Falhas criptográficas |
| RS-002 | JWT HS256; **a aplicação não inicia sem `JWT_SECRET` de 32+ caracteres** | A02, A07 |
| RS-003 | Algoritmo fixado em HS256 | Confusão de algoritmo / `alg: none` |
| RS-004 | Falhas de login indistinguíveis entre si | Enumeração de usuários |
| RS-005 | Posse verificada na consulta SQL; recurso alheio retorna **404, não 403** | API1 — BOLA |
| RS-006 | `ownerId` vem do token; esquema estrito rejeita campos do servidor | API6 — Mass assignment |
| RS-007 | Exclusivamente prepared statements | A03 — Injeção |
| RS-009 | Helmet: CSP, HSTS, `X-Frame-Options: DENY`, nosniff | A05 |
| RS-010 | 10 req/15 min na autenticação | API4 — Força bruta |
| RS-011 | Erro 500 devolve só um ID de correlação | A05, API8 |
| RS-013 | Container multi-stage, usuário não-root | A05 |
| RS-014 | `npm audit` reprova o build | A06 — Componentes vulneráveis |

**Não há segredo algum no código-fonte.** Um literal de segredo seria apontado
pelo SonarCloud como vulnerabilidade bloqueante.

---

## 3. A pipeline

```
push na main
   │
   ├─ 1. build-test      npm ci · tsc · 75 testes · npm audit ──┐
   │                                                            │ falhou? para
   ├─ 2. security-scan   SonarCloud + Quality Gate ─────────────┤
   │                                                            │
   └─ 3. deploy          SSH → EC2 → docker build → run         │
                         └─ smoke test em /health ──────────────┘
                                │
                         aplicação no ar
```

O deploy é inalcançável sem passar pelo portão da etapa 2 (RS-016). Se o novo
container não responder ao health check, o script restaura a versão anterior
(RF-024) e a pipeline falha.

---

## 4. A API

Todas as rotas sob `/api/tasks` exigem `Authorization: Bearer <jwt>`.

| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/health` | Estado do serviço — público |
| `POST` | `/api/auth/register` | Cria usuário |
| `POST` | `/api/auth/login` | Autentica e emite JWT |
| `GET` | `/api/auth/me` | Identidade do portador do token |
| `GET` | `/api/tasks` | Lista as tarefas do usuário (`?status=`) |
| `POST` | `/api/tasks` | Cria tarefa |
| `GET` | `/api/tasks/:id` | Obtém tarefa |
| `PATCH` | `/api/tasks/:id` | Atualiza parcialmente |
| `DELETE` | `/api/tasks/:id` | Remove tarefa |

Exemplo de uso:

```bash
BASE=http://<ip-da-ec2>

curl -X POST $BASE/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"aluno@exemplo.com","password":"SenhaSegura123"}'

TOKEN=$(curl -s -X POST $BASE/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"aluno@exemplo.com","password":"SenhaSegura123"}' | jq -r .token)

curl -X POST $BASE/api/tasks \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"title":"Estudar SSDLC"}'
```

---

## 5. Executando localmente

```bash
npm install

# Gere um segredo e crie o .env
node -e "console.log('JWT_SECRET=' + require('crypto').randomBytes(48).toString('base64url'))" > .env

npm test        # 75 testes
npm run dev     # http://localhost:3000/health
```

---

## 6. Implantação

O passo a passo completo — da chave SSH ao primeiro deploy — está em
**[docs/DEPLOY.md](docs/DEPLOY.md)**.

Resumo:

1. Iniciar o AWS Academy Learner Lab e copiar as credenciais.
2. `cd infra && terraform apply` → obtém o IP público.
3. Criar o projeto no SonarCloud e gerar o token.
4. Cadastrar os quatro secrets no GitHub.
5. `git push` na `main` → a pipeline publica a aplicação.

### Secrets necessários no GitHub

| Secret | Conteúdo |
|---|---|
| `SONAR_TOKEN` | Token do SonarCloud |
| `EC2_HOST` | IP público da instância |
| `EC2_SSH_KEY` | Chave SSH privada (arquivo inteiro) |
| `JWT_SECRET` | Segredo de 32+ caracteres |

---

## 7. Estrutura

```
├── specs/          Especificações — a origem de todo o código
├── src/
│   ├── config.ts       Configuração validada (falha rápida)
│   ├── app.ts          Montagem do Express e middlewares de segurança
│   ├── server.ts       Ciclo de vida do processo
│   ├── lib/            database · security · schemas · logger
│   ├── middleware/     authenticate · errorHandler
│   └── routes/         auth · tasks
├── tests/          75 testes que citam os IDs dos requisitos
├── infra/          Terraform — EC2 e security group
├── scripts/        deploy.sh com verificação e reversão
├── .github/        Pipeline de CI/CD
└── docs/           Guia de implantação
```

## Tecnologias

Node.js 20 · TypeScript · Express · SQLite · Zod · JWT · bcrypt · Helmet ·
Jest · Docker · Terraform · GitHub Actions · SonarCloud
