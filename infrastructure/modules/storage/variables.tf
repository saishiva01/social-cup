variable "environment" {
  description = "Environment name (dev, staging, production) used in resource naming"
  type        = string
}

variable "versioning_enabled" {
  description = "Whether to enable S3 bucket versioning for the images bucket"
  type        = bool
  default     = false
}

variable "cloudfront_price_class" {
  description = "CloudFront price class"
  type        = string
  default     = "PriceClass_100"
}
