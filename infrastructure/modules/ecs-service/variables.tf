variable "environment" {
  description = "Environment name (dev, staging, production) used in resource naming"
  type        = string
}

variable "vpc_id" {
  description = "VPC ID to deploy the ALB and ECS service into"
  type        = string
}

variable "public_subnet_ids" {
  description = "Public subnet IDs for the ALB"
  type        = list(string)
}

variable "private_subnet_ids" {
  description = "Private subnet IDs for the ECS tasks (API service + jobs)"
  type        = list(string)
}

variable "container_image" {
  description = "Container image URI (ECR) used by both the API service task and the jobs task"
  type        = string
}

variable "container_port" {
  description = "Port the API container listens on"
  type        = number
  default     = 3000
}

variable "health_check_path" {
  description = "ALB target group health check path"
  type        = string
  default     = "/health"
}

variable "certificate_arn" {
  description = "ACM certificate ARN for the ALB HTTPS listener (provisioned outside this module)"
  type        = string
}

variable "desired_count" {
  description = "Desired number of API service tasks"
  type        = number
  default     = 1
}

variable "cpu" {
  description = "Fargate CPU units for the API task"
  type        = number
  default     = 256
}

variable "memory" {
  description = "Fargate memory (MB) for the API task"
  type        = number
  default     = 512
}

variable "jobs_cpu" {
  description = "Fargate CPU units for the one-off jobs task"
  type        = number
  default     = 256
}

variable "jobs_memory" {
  description = "Fargate memory (MB) for the one-off jobs task"
  type        = number
  default     = 512
}

variable "log_retention_days" {
  description = "CloudWatch log group retention in days"
  type        = number
  default     = 30
}

variable "images_bucket_arn" {
  description = "ARN of the S3 images bucket the task role is granted read/write access to"
  type        = string
}

variable "environment_variables" {
  description = "Plain (non-secret) environment variables injected into both the API and jobs containers"
  type        = map(string)
  default     = {}
}

variable "container_secrets" {
  description = "Map of container environment variable name to Secrets Manager secret name or ARN, injected via the ECS `secrets` mechanism into both the API and jobs containers"
  type        = map(string)
  default     = {}
}

variable "secret_name_prefix" {
  description = "Secrets Manager name prefix (e.g. \"social-cup/dev\") the execution role is granted secretsmanager:GetSecretValue on, scoped as \"<prefix>/*\". Using a prefix instead of exact ARNs avoids a circular module dependency between this module and modules/database and modules/secrets (see README)."
  type        = string
}
