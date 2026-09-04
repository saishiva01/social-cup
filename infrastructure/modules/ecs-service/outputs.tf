output "cluster_arn" {
  description = "ARN of the ECS cluster"
  value       = aws_ecs_cluster.this.arn
}

output "cluster_name" {
  description = "Name of the ECS cluster"
  value       = aws_ecs_cluster.this.name
}

output "service_name" {
  description = "Name of the API ECS service"
  value       = aws_ecs_service.api.name
}

output "alb_dns_name" {
  description = "Public DNS name of the ALB"
  value       = aws_lb.this.dns_name
}

output "alb_zone_id" {
  description = "Route53 hosted zone ID of the ALB (for alias records)"
  value       = aws_lb.this.zone_id
}

output "ecs_security_group_id" {
  description = "Security group ID attached to the ECS tasks (API + jobs). Passed to modules/database as the only allowed inbound source for Postgres."
  value       = aws_security_group.ecs.id
}

output "alb_security_group_id" {
  description = "Security group ID attached to the ALB"
  value       = aws_security_group.alb.id
}

output "jobs_task_definition_arn" {
  description = "ARN (including revision) of the jobs task definition, used by modules/scheduler as the RunTask target"
  value       = aws_ecs_task_definition.jobs.arn
}

output "jobs_task_definition_family" {
  description = "Family name of the jobs task definition"
  value       = aws_ecs_task_definition.jobs.family
}

output "jobs_container_name" {
  description = "Container name inside the jobs task definition, used by modules/scheduler for containerOverrides"
  value       = "jobs"
}

output "api_task_definition_arn" {
  description = "ARN (including revision) of the API task definition"
  value       = aws_ecs_task_definition.api.arn
}

output "api_task_definition_family" {
  description = "Family name of the API task definition"
  value       = aws_ecs_task_definition.api.family
}

output "execution_role_arn" {
  description = "ARN of the ECS task execution role, needed by modules/scheduler to grant iam:PassRole"
  value       = aws_iam_role.execution.arn
}

output "task_role_arn" {
  description = "ARN of the ECS task role, needed by modules/scheduler to grant iam:PassRole"
  value       = aws_iam_role.task.arn
}
