# SPEC-002 — Gerenciamento de Tarefas

| Campo | Valor |
|---|---|
| Versão | 1.0 |
| Status | Aprovada |
| Depende de | [SPEC-001](SPEC-001-autenticacao.md), [SPEC-003](SPEC-003-seguranca.md) |

## 1. Modelo de dados

### Entidade `Task`

| Campo | Tipo | Restrições |
|---|---|---|
| `id` | UUID v4 | Chave primária, gerado pelo servidor |
| `ownerId` | UUID v4 | Chave estrangeira → `User.id`, **definido pelo token, nunca pelo cliente** |
| `title` | texto | Obrigatório, 1 a 200 caracteres |
| `description` | texto | Opcional, até 2000 caracteres |
| `status` | enum | `pending` \| `in_progress` \| `done`. Padrão: `pending` |
| `createdAt` | ISO-8601 UTC | Servidor |
| `updatedAt` | ISO-8601 UTC | Servidor |

> **Decisão de projeto:** `ownerId` é derivado exclusivamente do JWT. Um
> `ownerId` presente no corpo da requisição é ignorado silenciosamente. Isso
> previne a atribuição em massa (*mass assignment*) descrita em RS-006.

## 2. Requisitos funcionais

Todos os endpoints desta spec exigem autenticação (RS-003). Sem token válido,
a resposta é **401 Unauthorized**.

### RF-010 — Listar tarefas
`GET /api/tasks`

Retorna **apenas** as tarefas cujo `ownerId` é igual ao `sub` do token,
ordenadas por `createdAt` decrescente.

Parâmetro de consulta opcional `status`: quando presente, deve ser um dos
valores do enum; caso contrário responde **400**.

Resposta (200): `{ "tasks": [ ... ], "count": <n> }`

### RF-011 — Criar tarefa
`POST /api/tasks`

Requisição: `{ "title": "...", "description": "...", "status": "pending" }`

Valida conforme RF-014. Persiste com `ownerId` do token. Responde **201**.

### RF-012 — Obter tarefa por ID
`GET /api/tasks/:id`

| Situação | Resposta |
|---|---|
| Tarefa existe e pertence ao solicitante | 200 com a tarefa |
| Tarefa existe e pertence a **outro** usuário | **404 Not Found** |
| Tarefa não existe | 404 Not Found |
| `:id` não é UUID válido | 400 Bad Request |

> **Decisão de projeto:** tarefa de terceiro retorna 404, e não 403. Responder
> 403 confirmaria a existência do recurso, permitindo mapear IDs válidos por
> força bruta. Requisito RS-005.

### RF-013 — Atualizar tarefa
`PATCH /api/tasks/:id`

Aceita atualização parcial de `title`, `description` e `status`. Campos
ausentes permanecem inalterados. Tentativa de alterar `id`, `ownerId`,
`createdAt` é ignorada. Atualiza `updatedAt`. Mesma política de 404 de RF-012.

### RF-014 — Validação de entrada de tarefas

Rejeita com **400 Bad Request** quando:

| Condição | Campo |
|---|---|
| `title` ausente, não-string ou vazio após remoção de espaços | `title` |
| `title` com mais de 200 caracteres | `title` |
| `description` presente e não-string | `description` |
| `description` com mais de 2000 caracteres | `description` |
| `status` presente e fora do enum | `status` |

### RF-015 — Remover tarefa
`DELETE /api/tasks/:id`

Remove a tarefa do solicitante e responde **204 No Content**. Mesma política de
404 de RF-012.

## 3. Critérios de aceite

| ID | Critério |
|---|---|
| CA-002.1 | Tarefa criada é atribuída ao usuário do token |
| CA-002.2 | `ownerId` enviado no corpo é ignorado; prevalece o do token |
| CA-002.3 | Listagem do usuário A nunca contém tarefas do usuário B |
| CA-002.4 | `GET` de tarefa alheia por ID retorna 404 |
| CA-002.5 | `PATCH` de tarefa alheia retorna 404 e não altera o dado |
| CA-002.6 | `DELETE` de tarefa alheia retorna 404 e não remove o dado |
| CA-002.7 | `title` vazio retorna 400 |
| CA-002.8 | `status` inválido retorna 400 |
| CA-002.9 | `:id` malformado retorna 400 |
