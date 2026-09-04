terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

data "aws_iam_policy_document" "scheduler_assume" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["scheduler.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "scheduler" {
  name               = "social-cup-${var.environment}-scheduler-role"
  assume_role_policy = data.aws_iam_policy_document.scheduler_assume.json

  tags = {
    Name = "social-cup-${var.environment}-scheduler-role"
  }
}

data "aws_iam_policy_document" "scheduler_run_task" {
  statement {
    sid       = "AllowRunJobsTask"
    effect    = "Allow"
    actions   = ["ecs:RunTask"]
    resources = [var.jobs_task_definition_arn]

    condition {
      test     = "StringEquals"
      variable = "ecs:cluster"
      values   = [var.cluster_arn]
    }
  }

  statement {
    sid       = "AllowPassJobsTaskRoles"
    effect    = "Allow"
    actions   = ["iam:PassRole"]
    resources = [var.execution_role_arn, var.task_role_arn]
  }
}

resource "aws_iam_role_policy" "scheduler_run_task" {
  name   = "ecs-run-task"
  role   = aws_iam_role.scheduler.id
  policy = data.aws_iam_policy_document.scheduler_run_task.json
}

# Monthly credit reset. Runs 06:00 UTC on the 1st of every month.
resource "aws_scheduler_schedule" "credit_reset" {
  name                         = "social-cup-${var.environment}-credit-reset"
  description                  = "Monthly member credit reset job"
  schedule_expression          = "cron(0 6 1 * ? *)"
  schedule_expression_timezone = "UTC"

  flexible_time_window {
    mode = "OFF"
  }

  target {
    arn      = var.cluster_arn
    role_arn = aws_iam_role.scheduler.arn

    ecs_parameters {
      task_definition_arn = var.jobs_task_definition_arn
      launch_type          = "FARGATE"

      network_configuration {
        subnets          = var.private_subnet_ids
        security_groups  = [var.security_group_id]
        assign_public_ip = false
      }
    }

    input = jsonencode({
      containerOverrides = [
        {
          name    = var.container_name
          command = ["node", "dist/jobs/reset-credits.js"]
        }
      ]
    })
  }
}

# Expired redemption code cleanup. Runs every 5 minutes.
resource "aws_scheduler_schedule" "expired_code_cleanup" {
  name                = "social-cup-${var.environment}-expired-code-cleanup"
  description         = "Cleans up expired redemption codes"
  schedule_expression = "rate(5 minutes)"

  flexible_time_window {
    mode = "OFF"
  }

  target {
    arn      = var.cluster_arn
    role_arn = aws_iam_role.scheduler.arn

    ecs_parameters {
      task_definition_arn = var.jobs_task_definition_arn
      launch_type          = "FARGATE"

      network_configuration {
        subnets          = var.private_subnet_ids
        security_groups  = [var.security_group_id]
        assign_public_ip = false
      }
    }

    input = jsonencode({
      containerOverrides = [
        {
          name    = var.container_name
          command = ["node", "dist/jobs/cleanup-expired-codes.js"]
        }
      ]
    })
  }
}
