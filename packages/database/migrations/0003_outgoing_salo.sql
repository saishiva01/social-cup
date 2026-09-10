CREATE TABLE "credit_ledger_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"amount" integer NOT NULL,
	"reason" text NOT NULL,
	"stripe_invoice_id" text,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "credit_ledger_entries_stripe_invoice_id_unique" UNIQUE("stripe_invoice_id"),
	CONSTRAINT "credit_ledger_entries_amount_nonzero" CHECK ("credit_ledger_entries"."amount" <> 0),
	CONSTRAINT "credit_ledger_entries_reason_check" CHECK ("credit_ledger_entries"."reason" in ('monthly_grant'))
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"stripe_customer_id" text NOT NULL,
	"stripe_subscription_id" text,
	"status" text DEFAULT 'incomplete' NOT NULL,
	"current_period_start" timestamp with time zone,
	"current_period_end" timestamp with time zone,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "memberships_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "memberships_stripe_customer_id_unique" UNIQUE("stripe_customer_id"),
	CONSTRAINT "memberships_stripe_subscription_id_unique" UNIQUE("stripe_subscription_id"),
	CONSTRAINT "memberships_status_check" CHECK ("memberships"."status" in ('incomplete', 'active', 'past_due', 'canceled'))
);
--> statement-breakpoint
CREATE TABLE "stripe_webhook_events" (
	"stripe_event_id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "credit_ledger_entries" ADD CONSTRAINT "credit_ledger_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "credit_ledger_entries_user_period_idx" ON "credit_ledger_entries" USING btree ("user_id","period_end");--> statement-breakpoint
CREATE INDEX "memberships_status_idx" ON "memberships" USING btree ("status");