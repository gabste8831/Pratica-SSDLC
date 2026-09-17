# SPEC-000 — Visão Geral do Sistema

| Campo | Valor |
|---|---|
| Sistema | SecureTasks |
| Versão da spec | 1.0 |
| Status | Aprovada |
| Metodologia | Spec-Driven Development (SDD) |

## 1. Propósito

SecureTasks é uma API REST de gerenciamento de tarefas pessoais, com autenticação
por token e isolamento de dados por usuário. O sistema é deliberadamente pequeno:
o objetivo da disciplina não é a complexidade funcional, e sim exercitar um ciclo
de vida de desenvolvimento seguro (SSDLC) completo, no qual **cada linha de código
existe para satisfazer uma especificação escrita antes dela**.

## 2. Método: Spec-Driven Development

O fluxo de trabalho obrigatório neste repositório é:

```
  SPEC escrita  →  Teste que cita o ID da SPEC  →  Código que faz o teste passar
      ↑                                                        │
      └──────────── revisão / atualização da SPEC ←────────────┘
```

Regras adotadas:

1. **Nenhum código sem spec.** Toda função de negócio rastreia até um requisito
   `RF-*` (funcional) ou `RS-*` (segurança).
2. **Nenhuma spec sem teste.** Cada requisito verificável tem ao menos um teste
   automatizado que menciona seu ID no nome (`describe('RF-002 ...')`).
3. **A spec é a fonte da verdade.** Divergência entre código e spec é defeito da
   implementação até que a spec seja formalmente revisada.
4. **Mudança de comportamento começa pela spec**, não pelo código.

A rastreabilidade completa está em [SPEC-900-rastreabilidade.md](SPEC-900-rastreabilidade.md).

## 3. Escopo

### Dentro do escopo
- Cadastro e autenticação de usuários
- CRUD de tarefas pertencentes ao usuário autenticado
- Endpoint de health check para o load balancer / pipeline
- Persistência em SQLite (arquivo local no container)

### Fora do escopo
- Interface gráfica rica (há apenas uma página estática de demonstração)
- Recuperação de senha por e-mail
- Multi-tenancy organizacional
- Escalabilidade horizontal com estado compartilhado

## 4. Atores

| Ator | Descrição |
|---|---|
| Usuário anônimo | Pode registrar-se e autenticar-se |
| Usuário autenticado | Gerencia exclusivamente as próprias tarefas |
| Pipeline CI/CD | Consome `/health` para validar o deploy |

## 5. Índice de especificações

| ID | Documento | Assunto |
|---|---|---|
| SPEC-000 | este documento | Visão geral e método |
| SPEC-001 | [SPEC-001-autenticacao.md](SPEC-001-autenticacao.md) | Registro e login |
| SPEC-002 | [SPEC-002-tarefas.md](SPEC-002-tarefas.md) | CRUD de tarefas |
| SPEC-003 | [SPEC-003-seguranca.md](SPEC-003-seguranca.md) | Requisitos de segurança |
| SPEC-004 | [SPEC-004-operacao.md](SPEC-004-operacao.md) | Operação, deploy e observabilidade |
| SPEC-900 | [SPEC-900-rastreabilidade.md](SPEC-900-rastreabilidade.md) | Matriz spec → teste → código |

## 6. Restrições técnicas

| # | Restrição | Motivo |
|---|---|---|
| RT-01 | Runtime Node.js 20 LTS em TypeScript | Suporte a longo prazo e tipagem estática |
| RT-02 | Empacotamento em container Docker | Paridade entre ambiente local e EC2 |
| RT-03 | Implantação em instância EC2 na AWS | Exigência do enunciado da atividade |
| RT-04 | Sem dependência de serviços AWS que exijam criação de IAM Role | Limitação do AWS Academy Learner Lab |
| RT-05 | Análise estática obrigatória antes do deploy | Exigência do enunciado (scanner de segurança) |
