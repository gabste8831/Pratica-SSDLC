/**
 * Infraestrutura do SecureTasks — RF-023.
 *
 * Restrição RT-04 (AWS Academy Learner Lab): não são criados IAM Roles,
 * perfis de instância nem serviços gerenciados que os exijam. A instância
 * não carrega credenciais AWS; o deploy chega por SSH.
 */

terraform {
  required_version = ">= 1.5"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

# Amazon Linux 2023 mais recente, resolvido no momento do apply.
data "aws_ami" "al2023" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["al2023-ami-2023.*-x86_64"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

data "aws_vpc" "default" {
  default = true
}

# Par de chaves para o acesso SSH da pipeline.
resource "aws_key_pair" "deployer" {
  key_name   = "${var.project_name}-key"
  public_key = var.ssh_public_key

  tags = {
    Project = var.project_name
  }
}

resource "aws_security_group" "app" {
  name        = "${var.project_name}-sg"
  description = "Acesso HTTP publico e SSH restrito para a aplicacao SecureTasks"
  vpc_id      = data.aws_vpc.default.id

  # Porta 80: a aplicação precisa estar acessível pela internet, conforme o
  # enunciado da atividade.
  ingress {
    description = "HTTP publico"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # Porta 22: restrita pela variável `ssh_allowed_cidr`. O valor padrão é
  # aberto porque os runners do GitHub Actions não têm IP fixo; em ambiente
  # real, restrinja esta faixa.
  ingress {
    description = "SSH para o deploy"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = [var.ssh_allowed_cidr]
  }

  egress {
    description = "Saida liberada"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name    = "${var.project_name}-sg"
    Project = var.project_name
  }
}

resource "aws_instance" "app" {
  ami                         = data.aws_ami.al2023.id
  instance_type               = var.instance_type
  key_name                    = aws_key_pair.deployer.key_name
  vpc_security_group_ids      = [aws_security_group.app.id]
  associate_public_ip_address = true

  # Instala o Docker no primeiro boot; o deploy posterior apenas executa o
  # container.
  user_data = <<-EOF
    #!/bin/bash
    set -euo pipefail

    dnf update -y
    dnf install -y docker
    systemctl enable --now docker
    usermod -aG docker ec2-user

    # Marcador consultado pela pipeline para confirmar que o boot terminou.
    touch /var/lib/cloud/instance/securetasks-ready
  EOF

  # Garante que a troca de AMI ou de user_data recrie a instância.
  user_data_replace_on_change = true

  root_block_device {
    volume_size           = 20
    volume_type           = "gp3"
    encrypted             = true
    delete_on_termination = true
  }

  metadata_options {
    http_tokens   = "required" # IMDSv2 obrigatório
    http_endpoint = "enabled"
  }

  tags = {
    Name    = "${var.project_name}-app"
    Project = var.project_name
  }
}
