variable "aws_region" {
  description = "AWS region to deploy into"
  type        = string
  default     = "us-east-1"
}

variable "container_image" {
  description = "ECR image URI for the API container (also reused, with a command override, by the scheduled jobs task)"
  type        = string
}

variable "certificate_arn" {
  description = "ACM certificate ARN for the ALB HTTPS listener (ACM certificate provisioning is out of scope for this Terraform config)"
  type        = string
}

variable "db_name" {
  description = "Initial PostgreSQL database name"
  type        = string
  default     = "social_cup"
}

variable "db_username" {
  description = "Master username for the RDS PostgreSQL instance"
  type        = string
  default     = "social_cup_admin"
}
