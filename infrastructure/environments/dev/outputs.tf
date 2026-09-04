output "alb_dns_name" {
  description = "Public DNS name of the API ALB"
  value       = module.ecs_service.alb_dns_name
}

output "db_endpoint" {
  description = "RDS PostgreSQL connection endpoint (host:port)"
  value       = module.database.db_endpoint
}

output "cloudfront_domain_name" {
  description = "CloudFront distribution domain name serving cafe/drink images"
  value       = module.storage.cloudfront_domain_name
}

output "bucket_name" {
  description = "S3 bucket name storing cafe/drink images"
  value       = module.storage.bucket_name
}
