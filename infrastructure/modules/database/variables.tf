variable "environment" {
  description = "Environment name (dev, staging, production) used in resource naming"
  type        = string
}

variable "vpc_id" {
  description = "VPC ID the database security group is created in"
  type        = string
}

variable "private_subnet_ids" {
  description = "Private subnet IDs for the DB subnet group"
  type        = list(string)
}

variable "allowed_security_group_id" {
  description = "Security group ID (the ECS tasks' SG) allowed to reach Postgres on 5432. Traffic from anywhere else is denied."
  type        = string
}

variable "engine_version" {
  description = "PostgreSQL engine version"
  type        = string
  default     = "16"
}

variable "instance_class" {
  description = "RDS instance class"
  type        = string
}

variable "allocated_storage" {
  description = "Allocated storage in GB"
  type        = number
  default     = 20
}

variable "multi_az" {
  description = "Whether to deploy a Multi-AZ standby"
  type        = bool
}

variable "backup_retention_period" {
  description = "Number of days to retain automated backups"
  type        = number
}

variable "deletion_protection" {
  description = "Whether to enable deletion protection on the instance"
  type        = bool
}

variable "skip_final_snapshot" {
  description = "Whether to skip the final snapshot on destroy"
  type        = bool
}

variable "db_name" {
  description = "Initial database name created on the instance"
  type        = string
  default     = "social_cup"
}

variable "db_username" {
  description = "Master username for the RDS instance"
  type        = string
  default     = "social_cup_admin"
}
