variable "environment" {
  description = "Environment name (dev, staging, production) used in resource naming"
  type        = string
}

variable "cluster_arn" {
  description = "ARN of the ECS cluster to run scheduled jobs in"
  type        = string
}

variable "private_subnet_ids" {
  description = "Private subnet IDs the scheduled Fargate tasks launch into"
  type        = list(string)
}

variable "security_group_id" {
  description = "Security group ID attached to the scheduled Fargate tasks (reuses the ECS service security group)"
  type        = string
}

variable "jobs_task_definition_arn" {
  description = "ARN of the jobs ECS task definition to RunTask against"
  type        = string
}

variable "container_name" {
  description = "Name of the container inside the jobs task definition, used for containerOverrides"
  type        = string
  default     = "jobs"
}

variable "execution_role_arn" {
  description = "ARN of the jobs task's execution role, PassRole'd to the ECS scheduler role"
  type        = string
}

variable "task_role_arn" {
  description = "ARN of the jobs task's task role, PassRole'd to the ECS scheduler role"
  type        = string
}
