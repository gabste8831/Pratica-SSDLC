# SPEC-003 — Requisitos de Segurança

| Campo | Valor |
|---|---|
| Versão | 1.0 |
| Status | Aprovada |
| Referência | OWASP API Security Top 10 (2023), OWASP ASVS 4.0 |

Esta especificação define os requisitos de segurança (`RS-*`) que o sistema deve
satisfazer. Diferentemente dos requisitos funcionais, os `RS-*` são
**transversais**: aplicam-se a todo o código e são verificados tanto por testes
automatizados quanto pela análise estática da pipeline.

## 1. Requisitos

### RS-001 — Armazenamento de senhas
Senhas são armazenadas exclusivamente como hash **bcrypt** com fator de custo
mínimo **12**. O sistema nunca persiste, registra em log ou transmite a senha em
texto claro. A comparação usa a função de verificação da própria biblioteca,
que é resistente a ataque de temporização.

*Mitiga:* OWASP A02 — Falhas Criptográficas.

### RS-002 — Emissão de tokens
O token de sessão é um JWT assinado em **HS256** com as claims:

| Claim | Conteúdo |
|---|---|
| `sub` | `User.id` |
| `email` | e-mail do usuário |
| `iat` | emissão |
| `exp` | emissão + 3600 s |

O segredo vem da variável de ambiente `JWT_SECRET`. **A aplicação recusa-se a
iniciar** se `JWT_SECRET` estiver ausente ou tiver menos de 32 caracteres. Não
existe segredo padrão embutido no código-fonte.

> Esta é a regra mais importante desta spec para efeito da análise estática:
> um segredo literal no código seria classificado pelo SonarCloud como
> *hardcoded secret* — vulnerabilidade de severidade bloqueante.

*Mitiga:* OWASP A02, A07 — Falhas de Identificação e Autenticação.

### RS-003 — Verificação de token
Requisições a rotas protegidas apresentam o cabeçalho
`Authorization: Bearer <jwt>`. O sistema rejeita com **401** quando o token
está ausente, malformado, com assinatura inválida, expirado, ou com algoritmo
diferente de HS256 (defesa contra o ataque `alg: none` / confusão de algoritmo).

*Mitiga:* OWASP API2 — Autenticação Quebrada.

### RS-004 — Prevenção de enumeração de usuários
Falhas de autenticação produzem resposta idêntica — mesmo código de status,
mesma mensagem, sem distinguir "usuário inexistente" de "senha incorreta".

*Mitiga:* OWASP A07.

### RS-005 — Autorização em nível de objeto
Todo acesso a uma tarefa verifica que `task.ownerId` é igual ao `sub` do token
**antes** de retornar ou modificar o recurso. A verificação ocorre na camada de
consulta ao repositório, não apenas na rota. Recurso de terceiro é
indistinguível de recurso inexistente (404).

*Mitiga:* OWASP API1 — *Broken Object Level Authorization* (BOLA).

### RS-006 — Prevenção de atribuição em massa
Campos controlados pelo servidor (`id`, `ownerId`, `createdAt`, `updatedAt`)
nunca são lidos do corpo da requisição. A construção do objeto persistido é
feita campo a campo a partir de um payload já validado, jamais por cópia
irrestrita do corpo (`{...req.body}`).

*Mitiga:* OWASP API6 — *Mass Assignment*.

### RS-007 — Prevenção de injeção de SQL
Todo acesso ao banco usa **exclusivamente** consultas parametrizadas
(*prepared statements*). É proibida a construção de SQL por concatenação ou
interpolação de string com dado de origem externa.

*Mitiga:* OWASP A03 — Injeção.

### RS-008 — Validação de entrada
Todo payload de entrada é validado contra um esquema explícito (Zod) antes de
alcançar a lógica de negócio. A validação é *allowlist*: campos não declarados
no esquema são descartados. Tamanho máximo do corpo da requisição: **100 KB**.

*Mitiga:* OWASP A03, A04 — Projeto Inseguro.

### RS-009 — Cabeçalhos de segurança HTTP
Toda resposta inclui, via Helmet:
`Content-Security-Policy`, `X-Content-Type-Options: nosniff`,
`X-Frame-Options: DENY`, `Referrer-Policy`, `Strict-Transport-Security`.
O cabeçalho `X-Powered-By` é removido.

*Mitiga:* OWASP A05 — Configuração Incorreta de Segurança.

### RS-010 — Limitação de taxa
As rotas de autenticação aceitam no máximo **10 requisições por IP a cada 15
minutos**; as demais rotas, **100 por IP a cada 15 minutos**. Excedido o limite,
a resposta é **429 Too Many Requests**.

*Mitiga:* OWASP API4 — Consumo Irrestrito de Recursos.

### RS-011 — Tratamento de erros sem vazamento
Respostas de erro nunca contêm *stack trace*, consulta SQL, caminho de arquivo
ou nome de dependência. Erros não previstos produzem **500** com corpo genérico;
o detalhe técnico vai apenas para o log do servidor, correlacionado por um
identificador de requisição.

*Mitiga:* OWASP A05, OWASP API8.

### RS-012 — Registro de eventos de segurança
São registrados em log, sem dado sensível: tentativa de login (sucesso/falha),
rejeição de token, resposta 429 e erro 500. Senhas e tokens **nunca** aparecem
no log.

*Mitiga:* OWASP A09 — Falhas de Registro e Monitoramento.

### RS-013 — Execução do container sem privilégios
O container executa sob usuário não-root. A imagem final é *multi-stage*,
sem ferramentas de build, sem dependências de desenvolvimento e sem segredos
em camadas intermediárias.

*Mitiga:* OWASP A05.

### RS-014 — Segurança da cadeia de suprimentos
A pipeline executa `npm audit` a cada build. Vulnerabilidade de severidade
**alta ou crítica** em dependência de produção reprova o build. O arquivo
`package-lock.json` é versionado e a instalação em CI usa `npm ci`.

*Mitiga:* OWASP A06 — Componentes Vulneráveis e Desatualizados.

### RS-015 — Gestão de segredos
Nenhum segredo (senha, token, chave privada, credencial AWS) é versionado no
repositório. Segredos de pipeline residem em GitHub Actions Secrets; segredos de
runtime, em variáveis de ambiente da instância. O `.gitignore` bloqueia `.env`,
`*.pem` e `*.tfstate`.

*Mitiga:* OWASP A02, A05.

### RS-016 — Portão de qualidade e segurança na pipeline
O deploy é **bloqueado** se: os testes falharem, o *Quality Gate* do SonarCloud
não passar, ou o `npm audit` apontar vulnerabilidade alta/crítica. O portão é
obrigatório — não há caminho de deploy que o contorne.

*Mitiga:* exigência do enunciado da atividade.

## 2. Modelo de ameaças resumido (STRIDE)

| Ameaça | Cenário | Mitigação |
|---|---|---|
| **S**poofing | Atacante forja um JWT | RS-002, RS-003 |
| **T**ampering | Cliente altera `ownerId` no corpo | RS-006 |
| **R**epudiation | Usuário nega ter feito uma ação | RS-012 |
| **I**nformation disclosure | Erro 500 vaza a query SQL | RS-011 |
| | Login revela quais e-mails existem | RS-004 |
| | Usuário lê tarefa de outro | RS-005 |
| **D**enial of service | Força bruta no login | RS-010 |
| | Senha de 1 MB satura o bcrypt | RF-003 (limite 128) |
| **E**levation of privilege | Container comprometido vira root | RS-013 |

## 3. Verificação

| Mecanismo | Requisitos cobertos |
|---|---|
| Testes automatizados (Jest + Supertest) | RS-001 a RS-011 |
| SonarCloud — análise estática e Quality Gate | RS-002, RS-006, RS-007, RS-011 |
| `npm audit` na pipeline | RS-014 |
| Revisão de `Dockerfile` | RS-013 |
| `.gitignore` + varredura de segredos | RS-015 |
| Falha da pipeline em qualquer etapa acima | RS-016 |
