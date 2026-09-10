CREATE TABLE "admin_audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_user_id" uuid NOT NULL,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cafe_payout_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cafe_id" uuid NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"amount_cents" integer NOT NULL,
	"reference" text,
	"recorded_by_admin_id" uuid NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cafe_payout_payments_amount_positive" CHECK ("cafe_payout_payments"."amount_cents" > 0)
);
--> statement-breakpoint
CREATE TABLE "redemption_voids" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"redemption_id" uuid NOT NULL,
	"admin_user_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"credit_ledger_entry_id" uuid NOT NULL,
	"voided_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "redemption_voids_redemption_id_unique" UNIQUE("redemption_id"),
	CONSTRAINT "redemption_voids_credit_ledger_entry_id_unique" UNIQUE("credit_ledger_entry_id"),
	CONSTRAINT "redemption_voids_reason_length" CHECK (char_length("redemption_voids"."reason") between 1 and 500)
);
--> statement-breakpoint
ALTER TABLE "credit_ledger_entries" DROP CONSTRAINT "credit_ledger_entries_reason_check";--> statement-breakpoint
ALTER TABLE "cafe_barista_credentials" ALTER COLUMN "pin_hash" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "role" text DEFAULT 'user' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "deactivated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "admin_audit_log" ADD CONSTRAINT "admin_audit_log_admin_user_id_users_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cafe_payout_payments" ADD CONSTRAINT "cafe_payout_payments_cafe_id_cafes_id_fk" FOREIGN KEY ("cafe_id") REFERENCES "public"."cafes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cafe_payout_payments" ADD CONSTRAINT "cafe_payout_payments_recorded_by_admin_id_users_id_fk" FOREIGN KEY ("recorded_by_admin_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "redemption_voids" ADD CONSTRAINT "redemption_voids_redemption_id_redemptions_id_fk" FOREIGN KEY ("redemption_id") REFERENCES "public"."redemptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "redemption_voids" ADD CONSTRAINT "redemption_voids_admin_user_id_users_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "redemption_voids" ADD CONSTRAINT "redemption_voids_credit_ledger_entry_id_credit_ledger_entries_id_fk" FOREIGN KEY ("credit_ledger_entry_id") REFERENCES "public"."credit_ledger_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_audit_log_entity_idx" ON "admin_audit_log" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "admin_audit_log_admin_created_idx" ON "admin_audit_log" USING btree ("admin_user_id","created_at");--> statement-breakpoint
CREATE INDEX "cafe_payout_payments_cafe_period_idx" ON "cafe_payout_payments" USING btree ("cafe_id","period_start","period_end");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_role_check" CHECK ("users"."role" in ('user', 'admin'));--> statement-breakpoint
ALTER TABLE "credit_ledger_entries" ADD CONSTRAINT "credit_ledger_entries_reason_check" CHECK ("credit_ledger_entries"."reason" in ('monthly_grant', 'redemption', 'redemption_void'));