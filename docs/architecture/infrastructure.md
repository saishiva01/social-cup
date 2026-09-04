# Infrastructure Architecture

## Status

Terraform modules and three environment roots (dev/staging/production) exist under
`infrastructure/` — see that directory's own README for the exact workflow. **No `terraform
apply` has been run against real AWS infrastructure, and no `terraform validate`/`plan` has been
run at all** — this environment has no `terraform` CLI installed. A human with AWS credentials
must run `terraform validate` and `terraform plan` and review the plan output before the first
real `apply` in any environment. Nothing in this repository has provisioned any AWS resource.

## AWS services used, and why

| Service | Role | PRD source |
|---|---|---|
| VPC (2 AZ, public + private subnets) | Network isolation; RDS and ECS tasks live in private subnets, never directly internet-reachable | Module 1.1 |
| RDS PostgreSQL | The single system of record | Module 1.1, Section 4 |
| S3 | Cafe/drink photo storage | Module 1.1, Section 4 |
| CloudFront | CDN in front of S3 (Origin Access Control — the bucket itself is never public) | Module 1.1, Section 4 |
| ECS on Fargate | Runs the `apps/api` container; no EC2 instances to patch | Module 1.1 |
| Application Load Balancer | Public entry point to the API; TLS termination | Module 1.1 |
| EventBridge Scheduler | The two scheduled jobs — monthly credit reset, expired-code cleanup — as one-off ECS `RunTask` invocations | Module 1.2 |
| Secrets Manager | DB credentials, Stripe keys, JWT signing secrets, Sentry DSN — never in a committed file or plain environment variable in Terraform | Security requirement (root CLAUDE.md) |
| CloudWatch | Log groups for the API and job tasks | Module 1.2 |
| SES | Transactional email (verification, password reset, and any future transactional email) | Module 1.3 |

Explicitly **not** used, to keep the infrastructure footprint matched to the stated stack: no
ElastiCache/Redis (see the rate-limit open question in
[open-questions.md](../decisions/open-questions.md)), no Aurora, no Lambda (scheduled jobs run as
ECS tasks, not Lambda functions), no EKS/self-managed Kubernetes.

## Environments

Three independent Terraform root modules (`infrastructure/environments/{dev,staging,production}`)
compose the same six shared modules (`infrastructure/modules/*`) with different sizing:

| Setting | dev | staging | production |
|---|---|---|---|
| NAT gateways | 1 (shared) | 1 (shared) | 1 per AZ |
| RDS instance class | db.t4g.micro | db.t4g.small | db.t4g.medium |
| RDS Multi-AZ | no | no | yes |
| RDS backup retention | 1 day | 7 days | 30 days |
| RDS deletion protection | off | off | on |
| ECS desired task count | 1 | 1 | 2 |
| CloudWatch log retention | 14 days | 30 days | 90 days |

Each environment has its own state (S3 backend, partial-configured via a `backend.hcl` file kept
out of git — see `infrastructure/environments/*/backend.hcl.example`), its own VPC, and its own
database — no environment shares infrastructure with another.

## Secrets flow

`terraform apply` creates the Secrets Manager **secret resources** with placeholder values
(`lifecycle.ignore_changes` on the secret value, so Terraform never overwrites a real value with
the placeholder on a later apply). Populating the *real* value (Stripe live key, JWT signing
secret, etc.) is a deliberate manual step — via AWS CLI/Console or a CI/CD secrets step — kept
separate from `terraform apply` specifically so a real secret's value is never in a `.tf` file,
a Terraform plan diff, or a state file diff shown in a PR review. ECS task definitions reference
these secrets by ARN (`valueFrom` in the container definition), so the running container reads
them from Secrets Manager at task start, not from a baked-in environment variable.

## Local development uses none of this

Local dev runs Postgres and a mail catcher via `docker-compose.yml` at the repo root
(`pnpm infra:up`) — no AWS account or credentials are needed to develop or test `apps/api`
locally. See the root `README.md`.

## Email domain security (SPF / DKIM / DMARC)

PRD Module 1.3 requires transactional email to be configured on the Social Cup domain with SPF
and DKIM so verification and reset emails reliably reach the inbox. This is an SES domain
identity setup, not a Terraform-managed resource in this foundation (DNS is presumably managed
wherever the Social Cup domain is registered, outside this repo's control) — the concrete steps,
recorded for whoever configures the real domain:

1. Verify the sending domain in SES (adds a TXT record).
2. Enable Easy DKIM for the domain in SES (adds 3 CNAME records) — this is what lets SES sign
   outgoing mail so receiving servers can verify it wasn't spoofed.
3. Add an SPF record (`v=spf1 include:amazonses.com ~all`, merged with any existing SPF record
   for the domain — a domain can only have one SPF TXT record).
4. Add a DMARC record (`v=DMARC1; p=quarantine; rua=mailto:...`) — start at `p=quarantine`
   rather than `p=reject` until deliverability is confirmed, then tighten.
5. Request production access for the SES account (new SES accounts start in a sandbox that can
   only send to verified addresses) before any real user-facing email goes out.

## What's explicitly deferred

- CI/CD pipeline definition (PRD Module 1.1 mentions one; no pipeline YAML exists yet in this
  foundation — see [docs/development/phases.md](../development/phases.md)).
- ACM certificate provisioning/DNS validation for the ALB's HTTPS listener — the Terraform
  `ecs-service` module takes a certificate ARN as an input variable rather than provisioning one,
  since that depends on domain/DNS ownership decisions outside this repo.
- Autoscaling policies for the ECS service — `desired_count` is currently a fixed number per
  environment, not a target-tracking policy.
