# Social Cup — Infrastructure

Terraform infrastructure-as-code foundation for the Social Cup Dallas coffee
membership platform. This is engineering-foundation work: VPC/networking,
RDS PostgreSQL, ECS Fargate + ALB, S3 + CloudFront, Secrets Manager, and
EventBridge Scheduler jobs. No application/product code lives here.

## Directory layout

```
infrastructure/
  modules/
    networking/     VPC, public/private subnets, IGW, NAT Gateway(s), route tables
    database/       RDS PostgreSQL, DB subnet group, DB security group, DB credentials secret
    storage/        S3 bucket (private) + CloudFront (OAC) for cafe/drink images
    secrets/        Secrets Manager placeholders: Stripe, JWT, Sentry
    ecs-service/    ECS cluster, ALB, API service task+service, "jobs" task definition, IAM, SGs
    scheduler/      EventBridge Scheduler role + credit-reset / expired-code-cleanup schedules
  environments/
    dev/            Standalone root module: small/cheap sizing
    staging/        Standalone root module: staging sizing
    production/     Standalone root module: HA sizing, deletion protection on
```

Each environment directory is a **standalone Terraform root module** — it has
its own state, its own provider configuration, and wires the six modules
together with environment-appropriate sizing. Nothing is shared between
environments except the module source code.

## Module dependency graph (why it's structured this way)

```
networking ──┬──> ecs-service ──> database
             ├──> database
             └──> ecs-service ──> scheduler
storage ─────────> ecs-service
secrets  ┄┄┄┄┄┄┄┄> ecs-service   (name-only, see below — not a real Terraform edge)
```

`modules/database` needs the ECS tasks' security group ID (to scope its
Postgres ingress rule to "only the API/jobs tasks", never `0.0.0.0/0`), so
`database` depends on `ecs-service`. To avoid a circular module dependency,
`ecs-service` never references `module.database` or `module.secrets`
outputs. Instead, each environment's `main.tf` builds the Secrets Manager
**names** as plain interpolated strings (`social-cup/<env>/<secret>`, which
both `modules/secrets` and `modules/database` use as their naming
convention) and passes those strings — not ARNs pulled from module outputs —
into `ecs-service` as `container_secrets`. The ECS `secrets` container
definition field accepts either a full ARN or a bare secret name, and the
execution role's IAM policy grants `secretsmanager:GetSecretValue` on a
name-prefix wildcard (`social-cup/<env>/*`) rather than exact ARNs. This
keeps the dependency graph acyclic while still following the module
responsibilities as specified. See the comment block at the top of each
`environments/*/main.tf` for the same explanation in context.

One practical consequence: because `ecs-service` cannot depend on
`module.database` (only the reverse), Terraform does not guarantee the DB
credentials secret exists before the ECS service's first task launch on a
brand-new environment. In practice this self-heals — ECS retries failed task
launches automatically — but on a truly first `apply` you may see the API
service task fail once or twice before stabilizing. `ecs-service` *does*
depend on `module.secrets` (`depends_on`), so the five app secrets are not
subject to this race, only the DB credentials secret.

## Standard workflow (per environment)

```bash
cd environments/dev   # or staging / production

# 1. One-time: copy and fill in the backend config (bucket/table must
#    already exist — see backend.hcl.example for why they're not managed
#    here).
cp backend.hcl.example backend.hcl
# edit backend.hcl with real values

terraform init -backend-config=backend.hcl

# 2. One-time (or whenever variables change): copy and fill in tfvars.
cp terraform.tfvars.example terraform.tfvars
# edit terraform.tfvars — container_image, certificate_arn, etc.
# NEVER put real secret values in this file.

terraform plan -var-file=terraform.tfvars
terraform apply -var-file=terraform.tfvars
```

Repeat independently for `staging` and `production` (each has its own state
file per `backend.hcl`, and its own `terraform.tfvars`).

`backend.hcl` and `terraform.tfvars` are gitignored in every environment;
only the `.example` files are committed.

## How secrets actually get their real values

`terraform apply` creates the Secrets Manager **secret containers** with a
placeholder JSON body (`{"value": "REPLACE_ME"}`) for: `stripe-secret-key`,
`stripe-webhook-secret`, `access-token-secret`, `refresh-token-secret`,
`sentry-dsn` (via `modules/secrets`), plus a real, Terraform-generated
random password for `db-credentials` (via `modules/database` — this one
already has a working value after `apply`, since Terraform itself generated
it).

Every `aws_secretsmanager_secret_version` in this repo is wrapped in
`lifecycle { ignore_changes = [secret_string] }`, so once a real value is
written into a secret (by either method below), a subsequent
`terraform apply` will **not** revert it back to the placeholder.

Two supported ways to populate the real values:

**1. Manual (AWS CLI or Console)** — good for initial bootstrap:

```bash
aws secretsmanager put-secret-value \
  --secret-id social-cup/dev/stripe-secret-key \
  --secret-string '{"value":"sk_live_..."}'

aws secretsmanager put-secret-value \
  --secret-id social-cup/dev/stripe-webhook-secret \
  --secret-string '{"value":"whsec_..."}'

aws secretsmanager put-secret-value \
  --secret-id social-cup/dev/access-token-secret \
  --secret-string '{"value":"<generated JWT signing secret>"}'

aws secretsmanager put-secret-value \
  --secret-id social-cup/dev/refresh-token-secret \
  --secret-string '{"value":"<generated JWT signing secret>"}'

aws secretsmanager put-secret-value \
  --secret-id social-cup/dev/sentry-dsn \
  --secret-string '{"value":"https://...@sentry.io/..."}'
```

Or via the Secrets Manager console: open the secret, "Retrieve secret
value" → "Edit", paste the JSON body, save.

**2. CI/CD secret injection** — preferred for staging/production ongoing
rotation: your deploy pipeline (GitHub Actions, CodePipeline, etc.) holds
the real credential in its own secret store and calls
`aws secretsmanager put-secret-value` (or the SDK equivalent) as a deploy
step, after `terraform apply` has ensured the secret container exists and
before the ECS service is asked to redeploy/pick up new tasks. This keeps
real credential values out of both the Terraform state diff noise and the
git repository entirely.

Either way, the shape each secret's JSON body is expected to hold is
`{"value": "<the actual credential>"}`, except `db-credentials`, which holds
`{"username", "password", "engine", "host", "port", "dbname"}` (Terraform
populates this one for you).

The ECS task definitions (both the API service and the "jobs" task) read
these via the ECS `secrets` mechanism (`valueFrom` = secret name), so a
`put-secret-value` update takes effect the next time a task launches — no
Terraform involvement needed, and no code change needed on the app side
beyond reading `process.env.<NAME>`.

## Validation status — read before your first real `apply`

**This configuration was authored without a local `terraform` binary
available.** No `terraform validate`, `terraform plan`, `terraform fmt`, or
`terraform apply` has been run against it, and none of it has been checked
against real AWS credentials or an actual AWS account. Brace-matching,
variable/output cross-references, and module wiring were checked by hand
(re-reading every file), but this is not a substitute for the real tools.

**Before the first real `apply` in any environment, a human must:**

1. Run `terraform fmt -recursive` to normalize formatting.
2. Run `terraform init -backend-config=backend.hcl` (after creating the
   state bucket + DynamoDB lock table referenced in `backend.hcl`).
3. Run `terraform validate`.
4. Run `terraform plan -var-file=terraform.tfvars` and actually read the
   plan output — check resource counts, especially for the
   `single_nat_gateway` / `multi_az` / NAT Gateway per-AZ conditionals in
   `modules/networking`, and confirm nothing unexpected is being created or
   destroyed.
5. Only then `terraform apply`.

## Known simplifications / open questions

These are documented here rather than silently glossed over — see the
accompanying open-questions writeup for the full list, but in summary:

- **DB credentials secret injection into ECS** is done as one JSON blob
  (`DB_CREDENTIALS_SECRET` env var) rather than individual `DB_HOST`,
  `DB_PORT`, etc. env vars. ECS supports pulling individual JSON keys out of
  a single secret via `valueFrom = "<secret>:<jsonKey>::"`, which would be a
  clean follow-up if the app prefers discrete env vars.
- **Cross-module secret wiring uses deterministic name strings + an IAM
  wildcard**, not exact ARN references, specifically to avoid a circular
  dependency between `modules/database` and `modules/ecs-service` (see
  above). This is a deliberate, defensible pattern but is a departure from
  "always reference exact ARNs" purism.
- **RDS final snapshot identifier is a fixed name**
  (`social-cup-<env>-db-final-snapshot`), not timestamped. Destroying and
  recreating the production DB more than once will collide on that
  snapshot name and require manual cleanup (`aws rds delete-db-snapshot`)
  first. Fine for a foundation, worth revisiting before it matters in
  practice.
- **No ACM certificate provisioning** — `certificate_arn` is taken as a
  plain input variable per environment. Someone must issue/validate the
  certificate (in ACM, `us-east-1` or the deploy region as appropriate) out
  of band and put its ARN in `terraform.tfvars`.
- **No Route53 / DNS** — out of scope per the stack facts; the ALB and
  CloudFront domain names are exposed as outputs for whoever wires up DNS
  next.
- **Terraform state backend (S3 bucket + DynamoDB lock table) is assumed to
  already exist** — bootstrapping that bucket/table isn't itself managed by
  this Terraform config (chicken-and-egg problem), so it needs a one-time
  manual `aws s3 mb` / `aws dynamodb create-table` (or a tiny separate
  bootstrap Terraform config) before `terraform init` will work.
- **CloudFront uses the default `*.cloudfront.net` certificate**, not a
  custom domain — no `aliases`/ACM wiring was requested for the CDN, only
  for the ALB.
