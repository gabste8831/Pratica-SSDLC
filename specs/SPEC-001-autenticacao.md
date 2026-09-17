# SPEC-001 — Autenticação e Identidade

| Campo | Valor |
|---|---|
| Versão | 1.0 |
| Status | Aprovada |
| Depende de | [SPEC-003](SPEC-003-seguranca.md) |

## 1. Modelo de dados

### Entidade `User`

| Campo | Tipo | Restrições |
|---|---|---|
| `id` | UUID v4 | Chave primária, gerado pelo servidor |
| `email` | texto | Único, obrigatório, normalizado para minúsculas |
| `passwordHash` | texto | Obrigatório, **nunca** retornado em resposta HTTP |
| `createdAt` | ISO-8601 UTC | Preenchido pelo servidor |

## 2. Requisitos funcionais

### RF-001 — Registro de usuário
`POST /api/auth/register`

Requisição:
```json
{ "email": "aluno@exemplo.com", "password": "SenhaForte123" }
```

Comportamento:
1. O sistema valida o payload conforme RF-003.
2. Se já existir usuário com o mesmo e-mail (comparação case-insensitive), o
   sistema responde **409 Conflict**.
3. O sistema deriva o hash da senha conforme RS-001.
4. O sistema persiste o usuário e responde **201 Created**.

Resposta de sucesso (201):
```json
{ "id": "uuid", "email": "aluno@exemplo.com", "createdAt": "2026-01-01T00:00:00.000Z" }
```

O campo `passwordHash` **não** integra a resposta, em nenhuma hipótese.

### RF-002 — Autenticação
`POST /api/auth/login`

Comportamento:
1. O sistema localiza o usuário pelo e-mail normalizado.
2. O sistema compara a senha fornecida com o hash armazenado.
3. Em caso de sucesso, emite um JWT conforme RS-002 e responde **200 OK**.
4. Em caso de falha — **usuário inexistente ou senha incorreta** — responde
   **401 Unauthorized** com a mensagem genérica `"Credenciais inválidas"`.

> A mensagem de erro é idêntica nos dois casos de falha por exigência de RS-004
> (prevenção de enumeração de usuários).

Resposta de sucesso (200):
```json
{ "token": "<jwt>", "expiresIn": 3600 }
```

### RF-003 — Validação de entrada no cadastro

O sistema rejeita com **400 Bad Request** e um corpo descrevendo os campos
inválidos quando:

| Condição | Campo |
|---|---|
| `email` ausente, não-string ou fora do formato de e-mail | `email` |
| `email` com mais de 254 caracteres | `email` |
| `password` ausente ou não-string | `password` |
| `password` com menos de 10 caracteres | `password` |
| `password` com mais de 128 caracteres | `password` |
| `password` sem ao menos uma letra e um dígito | `password` |

O limite superior de 128 caracteres existe para limitar o custo computacional do
algoritmo de hash (mitigação de negação de serviço por senha longa).

### RF-004 — Identidade do usuário corrente
`GET /api/auth/me` — requer autenticação (RS-003).

Responde **200 OK** com `{ "id", "email", "createdAt" }` do portador do token.

## 3. Critérios de aceite

| ID | Critério |
|---|---|
| CA-001.1 | Registro com payload válido retorna 201 e não expõe `passwordHash` |
| CA-001.2 | Registro com e-mail duplicado retorna 409 |
| CA-001.3 | Registro com senha de 9 caracteres retorna 400 |
| CA-001.4 | Login com credenciais corretas retorna 200 e um JWT decodificável |
| CA-001.5 | Login com senha incorreta retorna 401 e mensagem genérica |
| CA-001.6 | Login com e-mail inexistente retorna 401 e **a mesma** mensagem de CA-001.5 |
| CA-001.7 | `GET /api/auth/me` sem token retorna 401 |
