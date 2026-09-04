# Partial backend configuration. Backend blocks cannot reference variables,
# so the actual bucket/key/region/dynamodb_table are supplied at init time:
#
#   terraform init -backend-config=backend.hcl
#
# See backend.hcl.example for the expected shape. Copy it to backend.hcl
# (gitignored) and fill in real values before running init.
terraform {
  backend "s3" {}
}
