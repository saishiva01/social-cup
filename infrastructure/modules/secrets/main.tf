terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

# Every credential Social Cup needs other than the DB master password (which
# lives in modules/database, next to the random_password that generates it).
# Terraform only ever creates the secret *containers* here, seeded with a
# placeholder value so the very first `apply` succeeds. Real values are
# populated out-of-band (manual AWS CLI/Console, or CI/CD secret injection)
# and protected from being clobbered by lifecycle.ignore_changes below.
locals {
  secrets = {
    stripe_secret_key    = "Stripe secret API key"
    stripe_webhook_secret = "Stripe webhook signing secret"
    access_token_secret   = "JWT access token signing secret"
    refresh_token_secret  = "JWT refresh token signing secret"
    sentry_dsn             = "Sentry DSN"
  }
}

resource "aws_secretsmanager_secret" "this" {
  for_each = local.secrets

  name        = "social-cup/${var.environment}/${replace(each.key, "_", "-")}"
  description = each.value

  tags = {
    Name = "social-cup-${var.environment}-${replace(each.key, "_", "-")}"
  }
}

resource "aws_secretsmanager_secret_version" "this" {
  for_each = local.secrets

  secret_id     = aws_secretsmanager_secret.this[each.key].id
  secret_string = jsonencode({ value = "REPLACE_ME" })

  # The real secret value is set out-of-band after apply (see README). This
  # ensures `terraform apply` never overwrites a value that was populated
  # manually or by CI/CD after the placeholder was created.
  lifecycle {
    ignore_changes = [secret_string]
  }
}
