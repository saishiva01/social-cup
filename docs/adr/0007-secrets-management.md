# ADR-0007: Secrets live in AWS Secrets Manager, never in Terraform state values or committed files

## Status

Accepted.

## Context

The stack must handle several real secrets: database credentials, Stripe secret key and webhook
signing secret, JWT access/refresh signing secrets, and (eventually) OAuth client secrets for
Google/Apple Sign-In. The security requirements (root [CLAUDE.md](../../CLAUDE.md)) state
secrets are never committed to git and deployed environments use a secret manager.

## Decision

- **Local development:** real per-developer values live only in git-ignored `.env` files, copied
  from a committed `.env.example` that documents every required variable with a safe placeholder
  or generation instruction (e.g. "generate with `openssl rand -hex 32`") — never a real value.
- **Staging/production:** AWS Secrets Manager. Terraform (`infrastructure/modules/secrets` and
  the database module) creates the secret _resources_ with placeholder values and
  `lifecycle { ignore_changes = [secret_string] }`, so applying Terraform again never overwrites
  a real value that was set afterward out-of-band. ECS task definitions reference secrets by ARN
  (`valueFrom`), so the container reads the real value from Secrets Manager at task start — the
  value is never baked into a Docker image, an ECS task definition's plain environment block, or
  Terraform state as a literal in a `.tf` file (it does still appear in Terraform state as the
  _current_ Secrets Manager value if state ever drifts to include it — see Consequences).
- The database module generates the RDS master password itself (`random_password` resource) and
  writes it straight to its own Secrets Manager secret — no human ever needs to see or transcribe
  the database password.

## Consequences

- Real secret values (Stripe live keys, production JWT secrets) are set via AWS CLI/Console (or
  a future CI/CD secrets step) after the first `terraform apply`, as a manual, deliberate action
  — documented in `infrastructure/README.md`. This is one extra manual step per environment setup
  in exchange for those values never appearing in a reviewable `.tf` file or PR diff.
- Terraform state itself (in the S3 backend) can contain sensitive values depending on provider
  behavior (e.g. the RDS module's generated password, via the `random_password` resource, is
  stored in state) — state must be treated as sensitive: the S3 backend bucket needs encryption
  at rest and access restricted to the Terraform execution role, not broad read access. This is a
  standard Terraform caveat, not specific to this project, but worth stating since it means "no
  secrets in git" is not automatically "no secrets anywhere Terraform touches."
- Rotating a secret (e.g. `ACCESS_TOKEN_SECRET`) is an AWS Secrets Manager operation followed by
  an ECS service redeploy to pick up the new value — not a `terraform apply`, since Terraform
  deliberately ignores changes to the secret value.
