# Guia de Implantação

Passo a passo do zero até a aplicação publicada na internet.
Tempo estimado: 30 a 40 minutos na primeira vez.

> **Sobre o AWS Academy Learner Lab:** as credenciais expiram a cada sessão
> (cerca de 4 horas) e a conta não permite criar IAM Roles. Por isso a
> arquitetura usa EC2 com deploy por SSH, sem ECR, ECS ou perfis de instância.
> Se o laboratório for reiniciado, a instância pode ser encerrada — refaça a
> etapa 2 e atualize o secret `EC2_HOST`.

---

## Etapa 1 — Gerar o par de chaves SSH

No seu computador, dentro da pasta do projeto:

```bash
ssh-keygen -t ed25519 -f securetasks-key -N "" -C "deploy-securetasks"
```

Isso cria dois arquivos:

| Arquivo | Destino |
|---|---|
| `securetasks-key` | chave **privada** → vira o secret `EC2_SSH_KEY` |
| `securetasks-key.pub` | chave **pública** → vai para o Terraform |

> Os dois arquivos já estão no `.gitignore` (RS-015). **Nunca** os versione.

---

## Etapa 2 — Provisionar a infraestrutura

### 2.1 Obter as credenciais do laboratório

1. Acesse o AWS Academy e inicie o **Learner Lab**.
2. Aguarde o indicador ficar verde e clique em **AWS Details**.
3. Clique em **Show** ao lado de *AWS CLI* e copie o bloco exibido.

Cole o conteúdo em `~/.aws/credentials` (Linux/macOS) ou
`C:\Users\<seu-usuario>\.aws\credentials` (Windows). Ele tem este formato:

```ini
[default]
aws_access_key_id=ASIA...
aws_secret_access_key=...
aws_session_token=...
```

Confirme o acesso:

```bash
aws sts get-caller-identity
```

### 2.2 Aplicar o Terraform

```bash
cd infra

terraform init

terraform apply -var="ssh_public_key=$(cat ../securetasks-key.pub)"
```

No Windows (PowerShell):

```powershell
cd infra
terraform init
terraform apply -var="ssh_public_key=$(Get-Content ../securetasks-key.pub -Raw)"
```

Confirme com `yes`. Ao final, o Terraform exibe:

```
application_url = "http://54.xxx.xxx.xxx"
public_ip       = "54.xxx.xxx.xxx"
```

**Anote o `public_ip`** — é o secret `EC2_HOST`.

### 2.3 Confirmar que a instância está pronta

O Docker é instalado no primeiro boot; aguarde 1 a 2 minutos e verifique:

```bash
ssh -i securetasks-key ec2-user@<public_ip> "docker --version"
```

Deve responder com a versão do Docker. Se a conexão for recusada, a instância
ainda está inicializando — aguarde e tente de novo.

---

## Etapa 3 — Configurar o SonarCloud

1. Acesse [sonarcloud.io](https://sonarcloud.io) e entre com a conta do GitHub.
2. **+** → **Analyze new project** → autorize o repositório `Pratica-SSDLC`.
3. Em **Set up**, escolha **With GitHub Actions**.
4. Copie o valor de `SONAR_TOKEN` exibido na tela.

### 3.1 Conferir a chave do projeto

Abra `sonar-project.properties` na raiz e confirme que `sonar.projectKey` e
`sonar.organization` batem com o que o SonarCloud mostra. O padrão é:

```properties
sonar.projectKey=gabste8831_Pratica-SSDLC
sonar.organization=gabste8831
```

### 3.2 Desativar a análise automática

Em **Administration → Analysis Method**, desative **Automatic Analysis**. Sem
isso a análise da pipeline entra em conflito com a automática e falha.

---

## Etapa 4 — Cadastrar os secrets no GitHub

No repositório: **Settings → Secrets and variables → Actions → New repository
secret**. Cadastre os quatro:

| Nome | Valor |
|---|---|
| `SONAR_TOKEN` | o token da etapa 3 |
| `EC2_HOST` | o `public_ip` da etapa 2 (só o IP, sem `http://`) |
| `EC2_SSH_KEY` | conteúdo **integral** de `securetasks-key`, incluindo as linhas `-----BEGIN...` e `-----END...` |
| `JWT_SECRET` | um segredo de 32+ caracteres (comando abaixo) |

Gere o `JWT_SECRET` com:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

---

## Etapa 5 — Publicar

```bash
git add .
git commit -m "feat: sistema SecureTasks com SDD, pipeline e scanner de seguranca"
git push -u origin main
```

Acompanhe em **Actions**. A pipeline executa:

| Etapa | O que faz |
|---|---|
| `build-test` | `npm ci`, verificação de tipos, 75 testes, `npm audit` |
| `security-scan` | SonarCloud + Quality Gate — **bloqueia o deploy se reprovar** |
| `deploy` | envia o código por SSH, constrói a imagem, sobe o container |
| smoke test | consulta `/health` até 12 vezes; falha se não responder |

Ao final, acesse `http://<EC2_HOST>/health`:

```json
{ "status": "ok", "version": "1.0.0", "uptime": 12.34, "timestamp": "..." }
```

---

## Verificação para a entrega

Roteiro de demonstração:

```bash
BASE=http://<EC2_HOST>

# 1. A aplicação está no ar
curl $BASE/health

# 2. Registro
curl -X POST $BASE/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"professor@exemplo.com","password":"SenhaSegura123"}'

# 3. Login
TOKEN=$(curl -s -X POST $BASE/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"professor@exemplo.com","password":"SenhaSegura123"}' \
  | python -c "import sys,json;print(json.load(sys.stdin)['token'])")

# 4. Rota protegida sem token → 401
curl -i $BASE/api/tasks

# 5. Com token → 200
curl -H "Authorization: Bearer $TOKEN" $BASE/api/tasks

# 6. Criar tarefa
curl -X POST $BASE/api/tasks \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"title":"Demonstrar a atividade"}'

# 7. Cabeçalhos de segurança (RS-009)
curl -I $BASE/health
```

### Demonstrar que o portão de segurança funciona

Para mostrar que o scanner realmente bloqueia o deploy, crie uma branch e
introduza uma vulnerabilidade proposital — por exemplo, um segredo fixo no
código:

```typescript
const jwtSecret = "segredo-fixo-no-codigo-1234567890";
```

Abra um pull request. O SonarCloud aponta o *hardcoded secret*, o Quality Gate
reprova e o job `deploy` nem chega a executar. Descarte a branch em seguida.

---

## Solução de problemas

| Sintoma | Causa provável | Solução |
|---|---|---|
| `Permission denied (publickey)` | O secret `EC2_SSH_KEY` está incompleto | Copie o arquivo inteiro, com as linhas BEGIN/END |
| Quality Gate falha no primeiro run | Análise automática ativa | Etapa 3.2 |
| `Project not found` no Sonar | Chave divergente | Ajuste `sonar-project.properties` |
| Smoke test expira | Container não subiu | `ssh ... "docker logs securetasks"` |
| `Connection refused` na porta 80 | Security group ou container parado | Confira o SG e `docker ps` |
| Credencial AWS expirada | Sessão do Learner Lab encerrou | Reinicie o lab e atualize `~/.aws/credentials` |
| A EC2 sumiu após reiniciar o lab | O laboratório encerra instâncias | Refaça a etapa 2 e atualize `EC2_HOST` |

Registros úteis na instância:

```bash
ssh -i securetasks-key ec2-user@<EC2_HOST>

docker ps -a                    # estado do container
docker logs securetasks         # registros da aplicação
docker logs -f securetasks      # acompanhar em tempo real
sudo cat /var/log/cloud-init-output.log   # instalação do Docker no boot
```

---

## Encerrar o ambiente

Para não consumir os créditos do laboratório:

```bash
cd infra
terraform destroy -var="ssh_public_key=$(cat ../securetasks-key.pub)"
```
