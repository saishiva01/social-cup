terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

data "aws_region" "current" {}
data "aws_caller_identity" "current" {}

# ---------------------------------------------------------------------------
# Cluster + logs
# ---------------------------------------------------------------------------

resource "aws_ecs_cluster" "this" {
  name = "social-cup-${var.environment}-cluster"

  setting {
    name  = "containerInsights"
    value = "disabled"
  }

  tags = {
    Name = "social-cup-${var.environment}-cluster"
  }
}

# Shared by both the API service and the jobs task definition.
resource "aws_cloudwatch_log_group" "ecs" {
  name              = "/ecs/social-cup-${var.environment}"
  retention_in_days = var.log_retention_days

  tags = {
    Name = "social-cup-${var.environment}-ecs-logs"
  }
}

# ---------------------------------------------------------------------------
# IAM
# ---------------------------------------------------------------------------

data "aws_iam_policy_document" "ecs_assume" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "execution" {
  name               = "social-cup-${var.environment}-ecs-execution-role"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume.json

  tags = {
    Name = "social-cup-${var.environment}-ecs-execution-role"
  }
}

resource "aws_iam_role_policy_attachment" "execution_managed" {
  role       = aws_iam_role.execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# Scoped by name prefix rather than exact secret ARNs. This intentionally
# avoids referencing modules.database / modules.secrets outputs from this
# module (see variables.tf: secret_name_prefix), which keeps this module's
# dependency graph one-directional (modules/database depends on this
# module's ECS security group output; this module must not depend back on
# modules/database or it would form a cycle).
data "aws_iam_policy_document" "execution_secrets" {
  statement {
    effect  = "Allow"
    actions = ["secretsmanager:GetSecretValue"]
    resources = [
      "arn:aws:secretsmanager:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:secret:${var.secret_name_prefix}/*"
    ]
  }
}

resource "aws_iam_role_policy" "execution_secrets" {
  name   = "secrets-read"
  role   = aws_iam_role.execution.id
  policy = data.aws_iam_policy_document.execution_secrets.json
}

resource "aws_iam_role" "task" {
  name               = "social-cup-${var.environment}-ecs-task-role"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume.json

  tags = {
    Name = "social-cup-${var.environment}-ecs-task-role"
  }
}

# Application permissions, kept minimal: read/write on the images bucket only.
data "aws_iam_policy_document" "task_s3" {
  statement {
    effect    = "Allow"
    actions   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
    resources = ["${var.images_bucket_arn}/*"]
  }

  statement {
    effect    = "Allow"
    actions   = ["s3:ListBucket"]
    resources = [var.images_bucket_arn]
  }
}

resource "aws_iam_role_policy" "task_s3" {
  name   = "images-bucket-access"
  role   = aws_iam_role.task.id
  policy = data.aws_iam_policy_document.task_s3.json
}

# ---------------------------------------------------------------------------
# Security groups
# ---------------------------------------------------------------------------

resource "aws_security_group" "alb" {
  name        = "social-cup-${var.environment}-alb-sg"
  description = "Social Cup ALB security group"
  vpc_id      = var.vpc_id

  ingress {
    description = "HTTP from internet"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "HTTPS from internet"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    description = "Allow all outbound"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "social-cup-${var.environment}-alb-sg"
  }
}

resource "aws_security_group" "ecs" {
  name        = "social-cup-${var.environment}-ecs-sg"
  description = "Social Cup ECS tasks security group"
  vpc_id      = var.vpc_id

  ingress {
    description     = "Container port from ALB only"
    from_port       = var.container_port
    to_port         = var.container_port
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  egress {
    description = "Allow all outbound"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "social-cup-${var.environment}-ecs-sg"
  }
}

# ---------------------------------------------------------------------------
# ALB
# ---------------------------------------------------------------------------

resource "aws_lb" "this" {
  name               = "social-cup-${var.environment}-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = var.public_subnet_ids

  tags = {
    Name = "social-cup-${var.environment}-alb"
  }
}

resource "aws_lb_target_group" "api" {
  name        = "social-cup-${var.environment}-api-tg"
  port        = var.container_port
  protocol    = "HTTP"
  vpc_id      = var.vpc_id
  target_type = "ip"

  health_check {
    path                = var.health_check_path
    protocol            = "HTTP"
    healthy_threshold   = 3
    unhealthy_threshold = 3
    timeout             = 5
    interval            = 30
    matcher             = "200-399"
  }

  tags = {
    Name = "social-cup-${var.environment}-api-tg"
  }
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.this.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type = "redirect"

    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }
}

resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.this.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = var.certificate_arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api.arn
  }
}

# ---------------------------------------------------------------------------
# Task definitions
# ---------------------------------------------------------------------------

locals {
  container_env     = [for name, value in var.environment_variables : { name = name, value = value }]
  container_secrets = [for name, arn in var.container_secrets : { name = name, valueFrom = arn }]
}

resource "aws_ecs_task_definition" "api" {
  family                   = "social-cup-${var.environment}-api"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.cpu
  memory                   = var.memory
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task.arn

  container_definitions = jsonencode([
    {
      name      = "api"
      image     = var.container_image
      essential = true

      portMappings = [
        {
          containerPort = var.container_port
          protocol      = "tcp"
        }
      ]

      environment = local.container_env
      secrets     = local.container_secrets

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.ecs.name
          "awslogs-region"        = data.aws_region.current.name
          "awslogs-stream-prefix" = "api"
        }
      }
    }
  ])

  tags = {
    Name = "social-cup-${var.environment}-api-task"
  }
}

resource "aws_ecs_service" "api" {
  name            = "social-cup-${var.environment}-api"
  cluster         = aws_ecs_cluster.this.id
  task_definition = aws_ecs_task_definition.api.arn
  desired_count   = var.desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = var.private_subnet_ids
    security_groups  = [aws_security_group.ecs.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.api.arn
    container_name   = "api"
    container_port   = var.container_port
  }

  depends_on = [aws_lb_listener.https, aws_iam_role_policy_attachment.execution_managed]

  tags = {
    Name = "social-cup-${var.environment}-api-service"
  }
}

# Second, minimal task definition reused by EventBridge Scheduler (see
# modules/scheduler) to RunTask one-off jobs against the same image, with the
# container command overridden per schedule. No aws_ecs_service is created
# for this task definition — it is invoked directly via RunTask.
resource "aws_ecs_task_definition" "jobs" {
  family                   = "social-cup-${var.environment}-jobs"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.jobs_cpu
  memory                   = var.jobs_memory
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task.arn

  container_definitions = jsonencode([
    {
      name      = "jobs"
      image     = var.container_image
      essential = true

      environment = local.container_env
      secrets     = local.container_secrets

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.ecs.name
          "awslogs-region"        = data.aws_region.current.name
          "awslogs-stream-prefix" = "jobs"
        }
      }
    }
  ])

  tags = {
    Name = "social-cup-${var.environment}-jobs-task"
  }
}
