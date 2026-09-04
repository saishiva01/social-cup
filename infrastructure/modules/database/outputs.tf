output "db_endpoint" {
  description = "Connection endpoint (host:port) of the RDS instance"
  value       = aws_db_instance.this.endpoint
}

output "db_port" {
  description = "Port the RDS instance listens on"
  value       = aws_db_instance.this.port
}

output "db_security_group_id" {
  description = "Security group ID attached to the RDS instance"
  value       = aws_security_group.db.id
}

output "db_credentials_secret_arn" {
  description = "ARN of the Secrets Manager secret holding the DB master credentials"
  value       = aws_secretsmanager_secret.db_credentials.arn
}

output "db_credentials_secret_name" {
  description = "Name of the Secrets Manager secret holding the DB master credentials"
  value       = aws_secretsmanager_secret.db_credentials.name
}
