output "scheduler_role_arn" {
  description = "ARN of the IAM role assumed by EventBridge Scheduler to RunTask"
  value       = aws_iam_role.scheduler.arn
}

output "credit_reset_schedule_arn" {
  description = "ARN of the monthly credit-reset schedule"
  value       = aws_scheduler_schedule.credit_reset.arn
}

output "expired_code_cleanup_schedule_arn" {
  description = "ARN of the expired-redemption-code-cleanup schedule"
  value       = aws_scheduler_schedule.expired_code_cleanup.arn
}
