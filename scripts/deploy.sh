#!/bin/bash
#
# Implantação do SecureTasks na instância EC2 — RF-024.
#
# O container novo só assume a porta pública depois de responder ao health
# check. Em caso de falha, o container anterior é restaurado.
#
# Executado pela pipeline via SSH, com JWT_SECRET no ambiente.

set -euo pipefail

CONTAINER="securetasks"
IMAGEM="securetasks:latest"
IMAGEM_ANTERIOR="securetasks:anterior"
PORTA_HOST=80
PORTA_APP=3000
DIRETORIO="/home/ec2-user/build"

log() { echo "[$(date '+%H:%M:%S')] $*"; }

# RS-002 — sem segredo válido, não há implantação.
if [ -z "${JWT_SECRET:-}" ]; then
  echo "ERRO: JWT_SECRET não definido." >&2
  exit 1
fi

if [ "${#JWT_SECRET}" -lt 32 ]; then
  echo "ERRO: JWT_SECRET deve ter no mínimo 32 caracteres." >&2
  exit 1
fi

# ------------------------------------------------------------------
# Preparar o código enviado pela pipeline
# ------------------------------------------------------------------
log "Extraindo os arquivos da aplicação"
rm -rf "$DIRETORIO"
mkdir -p "$DIRETORIO"
tar xzf /home/ec2-user/app.tar.gz -C "$DIRETORIO"
cd "$DIRETORIO"

# ------------------------------------------------------------------
# Preservar a imagem atual para eventual reversão
# ------------------------------------------------------------------
if docker image inspect "$IMAGEM" >/dev/null 2>&1; then
  log "Preservando a imagem atual para reversão"
  docker tag "$IMAGEM" "$IMAGEM_ANTERIOR"
  HA_ANTERIOR=1
else
  HA_ANTERIOR=0
fi

# ------------------------------------------------------------------
# Construir a nova imagem
# ------------------------------------------------------------------
log "Construindo a imagem"
docker build -t "$IMAGEM" .

# ------------------------------------------------------------------
# Substituir o container
# ------------------------------------------------------------------
log "Parando o container anterior"
docker stop "$CONTAINER" 2>/dev/null || true
docker rm "$CONTAINER" 2>/dev/null || true

log "Iniciando o novo container"
# O volume mantém o banco entre implantações.
docker volume create securetasks-data >/dev/null 2>&1 || true

docker run -d \
  --name "$CONTAINER" \
  --restart unless-stopped \
  -p "${PORTA_HOST}:${PORTA_APP}" \
  -e NODE_ENV=production \
  -e PORT="$PORTA_APP" \
  -e JWT_SECRET="$JWT_SECRET" \
  -e DATABASE_PATH=/app/data/securetasks.db \
  -e LOG_LEVEL=info \
  -v securetasks-data:/app/data \
  --memory 512m \
  --security-opt no-new-privileges \
  "$IMAGEM"

# ------------------------------------------------------------------
# Verificar a saúde antes de dar a implantação por concluída
# ------------------------------------------------------------------
log "Aguardando o health check"
SAUDAVEL=0

for tentativa in $(seq 1 20); do
  if curl -fsS --max-time 5 "http://127.0.0.1:${PORTA_HOST}/health" 2>/dev/null | grep -q '"status":"ok"'; then
    SAUDAVEL=1
    log "Aplicação saudável na tentativa ${tentativa}"
    break
  fi
  sleep 3
done

if [ "$SAUDAVEL" -ne 1 ]; then
  log "ERRO: a nova versão não respondeu ao health check"
  log "Registros do container:"
  docker logs --tail 50 "$CONTAINER" 2>&1 || true

  docker stop "$CONTAINER" 2>/dev/null || true
  docker rm "$CONTAINER" 2>/dev/null || true

  if [ "$HA_ANTERIOR" -eq 1 ]; then
    log "Restaurando a versão anterior"
    docker tag "$IMAGEM_ANTERIOR" "$IMAGEM"
    docker run -d \
      --name "$CONTAINER" \
      --restart unless-stopped \
      -p "${PORTA_HOST}:${PORTA_APP}" \
      -e NODE_ENV=production \
      -e PORT="$PORTA_APP" \
      -e JWT_SECRET="$JWT_SECRET" \
      -e DATABASE_PATH=/app/data/securetasks.db \
      -v securetasks-data:/app/data \
      --memory 512m \
      --security-opt no-new-privileges \
      "$IMAGEM_ANTERIOR"
    log "Versão anterior restaurada"
  fi

  exit 1
fi

# ------------------------------------------------------------------
# Limpeza
# ------------------------------------------------------------------
log "Removendo imagens não utilizadas"
docker image prune -f >/dev/null 2>&1 || true
rm -f /home/ec2-user/app.tar.gz

log "Implantação concluída"
docker ps --filter "name=${CONTAINER}" --format "{{.Names}}  {{.Status}}  {{.Ports}}"
