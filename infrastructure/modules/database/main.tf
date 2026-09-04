terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }
}

# Master password is generated once by Terraform and stored only in Secrets
# Manager (never in state-adjacent output, never printed). This module owns
# the DB credentials secret end-to-end because it is the only thing that
# knows the generated password.
resource "random_password" "db" {
  length  = 32
  special = false
}

resource "aws_db_subnet_group" "this" {
  name       = "social-cup-${var.environment}-db-subnet-group"
  subnet_ids = var.private_subnet_ids

  tags = {
    Name = "social-cup-${var.environment}-db-subnet-group"
  }
}

resource "aws_security_group" "db" {
  name        = "social-cup-${var.environment}-db-sg"
  description = "Allow Postgres access only from the ECS task security group"
  vpc_id      = var.vpc_id

  ingress {
    description     = "Postgres from ECS tasks"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [var.allowed_security_group_id]
  }

  egress {
    description = "Allow all outbound"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "social-cup-${var.environment}-db-sg"
  }
}

resource "aws_db_instance" "this" {
  identifier = "social-cup-${var.environment}-db"

  engine         = "postgres"
  engine_version = var.engine_version

  instance_class    = var.instance_class
  allocated_storage = var.allocated_storage
  storage_encrypted = true
  storage_type      = "gp3"

  db_name  = var.db_name
  username = var.db_username
  password = random_password.db.result
  port     = 5432

  db_subnet_group_name   = aws_db_subnet_group.this.name
  vpc_security_group_ids = [aws_security_group.db.id]
  publicly_accessible    = false

  multi_az                  = var.multi_az
  backup_retention_period   = var.backup_retention_period
  deletion_protection       = var.deletion_protection
  skip_final_snapshot       = var.skip_final_snapshot
  final_snapshot_identifier = var.skip_final_snapshot ? null : "social-cup-${var.environment}-db-final-snapshot"

  tags = {
    Name = "social-cup-${var.environment}-db"
  }
}

resource "aws_secretsmanager_secret" "db_credentials" {
  name        = "social-cup/${var.environment}/db-credentials"
  description = "RDS PostgreSQL master credentials for social-cup ${var.environment}"

  tags = {
    Name = "social-cup-${var.environment}-db-credentials"
  }
}

# Terraform is the sole owner of this value (it generated the password), so
# unlike modules/secrets there is no out-of-band write to protect against.
# It is still wrapped in ignore_changes so that a manual credential rotation
# (e.g. via `aws secretsmanager put-secret-value` + `aws rds modify-db-instance`)
# is never silently clobbered by a later `terraform apply`.
resource "aws_secretsmanager_secret_version" "db_credentials" {
  secret_id = aws_secretsmanager_secret.db_credentials.id
  secret_string = jsonencode({
    username = var.db_username
    password = random_password.db.result
    engine   = "postgres"
    host     = aws_db_instance.this.address
    port     = 5432
    dbname   = var.db_name
  })

  lifecycle {
    ignore_changes = [secret_string]
  }
}
