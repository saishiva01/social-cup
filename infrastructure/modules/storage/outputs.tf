output "bucket_name" {
  description = "Name of the S3 bucket holding cafe/drink images"
  value       = aws_s3_bucket.images.id
}

output "bucket_arn" {
  description = "ARN of the S3 bucket holding cafe/drink images"
  value       = aws_s3_bucket.images.arn
}

output "cloudfront_domain_name" {
  description = "Domain name of the CloudFront distribution in front of the images bucket"
  value       = aws_cloudfront_distribution.images.domain_name
}

output "cloudfront_distribution_id" {
  description = "ID of the CloudFront distribution in front of the images bucket"
  value       = aws_cloudfront_distribution.images.id
}
