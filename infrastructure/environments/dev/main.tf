locals {
  environment = "dev"

  # Deterministic Secrets Manager naming shared with modules/secrets and
  # modules/database (both name their secrets "social-cup/${environment}/...").
  # Built here as plain strings -- NOT as references to module outputs -- so
  # that module.ecs_service has no dependency edge back onto module.secrets
  # or module.database. That matters because module.database already depends
  # on module.ecs_service (it needs the ECS security group ID to scope its
  # Postgres ingress rule); a reference running the other way would create a
  # circular module dependency. See infrastructure/README.md for the full
  # explanation.
  secret_name_prefix = "social-cup/${local.environment}"

  container_secrets = {
    DB_CREDENTIALS_SECRET    = "${local.secret_name_prefix}/db-credentials"
    STRIPE_SECRET_KEY        = "${local.secret_name_prefix}/stripe-secret-key"
    STRIPE_WEBHOOK_SECRET    = "${local.secret_name_prefix}/stripe-webhook-secret"
    JWT_ACCESS_TOKEN_SECRET  = "${local.secret_name_prefix}/access-token-secret"
    JWT_REFRESH_TOKEN_SECRET = "${local.secret_name_prefix}/refresh-token-secret"
    SENTRY_DSN               = "${local.secret_name_prefix}/sentry-dsn"
  }
}

module "networking" {
  source = "../../modules/networking"

  environment        = local.environment
  single_nat_gateway = true
}

module "secrets" {
  source = "../../modules/secrets"

  environment = local.environment
}

module "storage" {
  source = "../../modules/storage"

  environment        = local.environment
  versioning_enabled = false
}

module "ecs_service" {
  source = "../../modules/ecs-service"

  environment        = local.environment
  vpc_id             = module.networking.vpc_id
  public_subnet_ids  = module.networking.public_subnet_ids
  private_subnet_ids = module.networking.private_subnet_ids

  container_image   = var.container_image
  container_port    = 3000
  health_check_path = "/health"
  certificate_arn   = var.certificate_arn

  desired_count = 1
  cpu           = 256
  memory        = 512
  jobs_cpu      = 256
  jobs_memory   = 512

  log_retention_days = 14

  images_bucket_arn = module.storage.bucket_arn

  environment_variables = {
    NODE_ENV          = "development"
    PORT              = "3000"
    AWS_REGION        = var.aws_region
    S3_BUCKET_NAME    = module.storage.bucket_name
    CLOUDFRONT_DOMAIN = module.storage.cloudfront_domain_name
  }

  container_secrets  = local.container_secrets
  secret_name_prefix = local.secret_name_prefix

  # This module depends on module.storage and module.networking (via the
  # references above) but must NOT depend on module.database -- see the
  # comment on local.secret_name_prefix above.
  depends_on = [module.secrets]
}

module "database" {
  source = "../../modules/database"

  environment               = local.environment
  vpc_id                    = module.networking.vpc_id
  private_subnet_ids        = module.networking.private_subnet_ids
  allowed_security_group_id = module.ecs_service.ecs_security_group_id

  engine_version = "16"
  instance_class = "db.t4g.micro"

  allocated_storage       = 20
  multi_az                = false
  backup_retention_period = 1
  deletion_protection     = false
  skip_final_snapshot     = true

  db_name     = var.db_name
  db_username = var.db_username
}

module "scheduler" {
  source = "../../modules/scheduler"

  environment              = local.environment
  cluster_arn              = module.ecs_service.cluster_arn
  private_subnet_ids       = module.networking.private_subnet_ids
  security_group_id        = module.ecs_service.ecs_security_group_id
  jobs_task_definition_arn = module.ecs_service.jobs_task_definition_arn
  container_name           = module.ecs_service.jobs_container_name
  execution_role_arn       = module.ecs_service.execution_role_arn
  task_role_arn            = module.ecs_service.task_role_arn
}
