output "public_ip" {
  description = "IP publico da instancia. Registre como secret EC2_HOST no GitHub."
  value       = aws_instance.app.public_ip
}

output "application_url" {
  description = "URL publica da aplicacao"
  value       = "http://${aws_instance.app.public_ip}"
}

output "health_url" {
  description = "Endpoint consultado pela pipeline para validar o deploy"
  value       = "http://${aws_instance.app.public_ip}/health"
}

output "ssh_command" {
  description = "Comando de acesso a instancia"
  value       = "ssh -i securetasks-key ec2-user@${aws_instance.app.public_ip}"
}
