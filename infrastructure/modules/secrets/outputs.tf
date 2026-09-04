output "secret_arns" {
  description = "Map of secret key (stripe_secret_key, stripe_webhook_secret, access_token_secret, refresh_token_secret, sentry_dsn) to its Secrets Manager ARN"
  value       = { for k, v in aws_secretsmanager_secret.this : k => v.arn }
}

output "secret_names" {
  description = "Map of secret key to its Secrets Manager secret name"
  value       = { for k, v in aws_secretsmanager_secret.this : k => v.name }
}
