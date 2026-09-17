# SPEC-004 — Operação, Implantação e Pipeline

| Campo | Valor |
|---|---|
| Versão | 1.0 |
| Status | Aprovada |

## 1. Requisitos operacionais

### RF-020 — Health check
`GET /health` — público, sem autenticação, sem limitação de taxa.

Responde **200 OK**:
```json
{ "status": "ok", "version": "1.0.0", "uptime": 123.4, "timestamp": "..." }
```

Se a conexão com o banco estiver indisponível, responde **503** com
`{ "status": "degraded" }`. A pipeline usa este endpoint como critério objetivo
de sucesso do deploy.

> O endpoint não expõe versão de dependências, variáveis de ambiente nem
> informação de infraestrutura (RS-011).

### RF-021 — Configuração por ambiente

| Variável | Obrigatória | Padrão | Descrição |
|---|---|---|---|
| `PORT` | não | `3000` | Porta de escuta |
| `NODE_ENV` | não | `development` | Ambiente |
| `JWT_SECRET` | **sim** | — | Segredo HS256, mínimo 32 caracteres |
| `DATABASE_PATH` | não | `./data/securetasks.db` | Arquivo SQLite |
| `LOG_LEVEL` | não | `info` | Nível de log |

A configuração é validada na inicialização. Configuração inválida **aborta o
processo com código de saída diferente de zero** — o sistema nunca inicia em
estado inseguro (*fail fast*).

### RF-022 — Encerramento gracioso
Ao receber `SIGTERM` ou `SIGINT`, o servidor para de aceitar novas conexões,
conclui as em andamento (limite de 10 s), fecha o banco e encerra com código 0.

## 2. Arquitetura de implantação

```
   Desenvolvedor
        │ git push (branch main)
        ▼
  ┌──────────────────────────────────────────────┐
  │           GitHub Actions — CI/CD             │
  │                                              │
  │  1. build      npm ci + tsc                  │
  │  2. test       Jest (cobertura → lcov)       │
  │  3. audit      npm audit (RS-014)            │
  │  4. sonar      SonarCloud + Quality Gate     │  ◄── PORTÃO (RS-016)
  │  5. docker     build da imagem               │
  │  6. deploy     SSH → EC2 → docker run        │
  │  7. smoke      GET /health na URL pública    │
  └──────────────────────────────────────────────┘
        │ SSH (porta 22, restrita por Security Group)
        ▼
  ┌──────────────────────────────────────────────┐
  │   AWS EC2  t3.micro  ·  Amazon Linux 2023    │
  │   ┌────────────────────────────────────────┐ │
  │   │ Docker                                 │ │
  │   │   container securetasks                │ │
  │   │   usuário não-root  (RS-013)           │ │
  │   │   porta 3000 → 80 no host              │ │
  │   └────────────────────────────────────────┘ │
  └──────────────────────────────────────────────┘
        │ HTTP porta 80
        ▼
      Internet — http://<ip-publico>/
```

### RF-023 — Infraestrutura como código
A infraestrutura é declarada em Terraform e versionada em `infra/`. Recursos:

| Recurso | Configuração |
|---|---|
| Instância EC2 | `t3.micro`, Amazon Linux 2023, IP público |
| Security Group | Entrada: 22/tcp e 80/tcp. Saída: liberada |
| Key Pair | Chave pública fornecida pelo operador |
| User data | Instala Docker e habilita o serviço no boot |

> **Restrição do AWS Academy (RT-04):** não são criados IAM Roles, perfis de
> instância nem serviços gerenciados que os exijam. A instância não possui
> credenciais AWS — o deploy chega por SSH.

### RF-024 — Estratégia de implantação
Substituição do container (*recreate*): o novo container só recebe tráfego
depois que responde ao health check local. Em caso de falha, a implantação é
abortada e o container anterior permanece no ar (`scripts/deploy.sh`).

## 3. Critérios de aceite

| ID | Critério |
|---|---|
| CA-004.1 | `GET /health` retorna 200 com `status: ok` |
| CA-004.2 | Ausência de `JWT_SECRET` impede a inicialização |
| CA-004.3 | `JWT_SECRET` com menos de 32 caracteres impede a inicialização |
| CA-004.4 | A pipeline falha quando um teste falha |
| CA-004.5 | A pipeline falha quando o Quality Gate reprova |
| CA-004.6 | Após o deploy, a URL pública responde 200 em `/health` |
