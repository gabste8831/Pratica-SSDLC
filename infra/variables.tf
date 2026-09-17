variable "aws_region" {
  description = "Regiao da AWS. O AWS Academy Learner Lab opera em us-east-1."
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Prefixo aplicado aos nomes dos recursos"
  type        = string
  default     = "securetasks"
}

variable "instance_type" {
  description = "Tipo da instancia EC2"
  type        = string
  default     = "t3.micro"
}

variable "ssh_public_key" {
  description = "Chave publica SSH autorizada a acessar a instancia (conteudo do arquivo .pub)"
  type        = string
}

variable "ssh_allowed_cidr" {
  description = "Faixa autorizada a acessar a porta 22. Restrinja em ambiente real."
  type        = string
  default     = "0.0.0.0/0"
}
