CREATE TABLE "barista_trusted_devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cafe_id" uuid NOT NULL,
	"device_token_hash" text NOT NULL,
	"pin_version_at_issue" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "barista_trusted_devices_device_token_hash_unique" UNIQUE("device_token_hash")
);
--> statement-breakpoint
CREATE TABLE "cafe_barista_credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cafe_id" uuid NOT NULL,
	"pin_hash" text NOT NULL,
	"pin_version" integer DEFAULT 1 NOT NULL,
	"payout_rate_cents" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cafe_barista_credentials_cafe_id_unique" UNIQUE("cafe_id"),
	CONSTRAINT "cafe_barista_credentials_payout_rate_positive" CHECK ("cafe_barista_credentials"."payout_rate_cents" is null or "cafe_barista_credentials"."payout_rate_cents" > 0)
);
--> statement-breakpoint
CREATE TABLE "redemption_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"cafe_id" uuid NOT NULL,
	"drink_id" uuid NOT NULL,
	"code_hash" text NOT NULL,
	"backup_code_hash" text NOT NULL,
	"credit_price" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"redeemed_at" timestamp with time zone,
	"canceled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "redemption_codes_code_hash_unique" UNIQUE("code_hash"),
	CONSTRAINT "redemption_codes_backup_code_hash_unique" UNIQUE("backup_code_hash"),
	CONSTRAINT "redemption_codes_status_check" CHECK ("redemption_codes"."status" in ('pending', 'redeemed', 'canceled')),
	CONSTRAINT "redemption_codes_credit_price_positive" CHECK ("redemption_codes"."credit_price" > 0)
);
--> statement-breakpoint
CREATE TABLE "redemptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"redemption_code_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"cafe_id" uuid NOT NULL,
	"drink_id" uuid NOT NULL,
	"credit_ledger_entry_id" uuid NOT NULL,
	"barista_trusted_device_id" uuid NOT NULL,
	"credit_amount" integer NOT NULL,
	"payout_rate_cents" integer NOT NULL,
	"redeemed_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "redemptions_redemption_code_id_unique" UNIQUE("redemption_code_id"),
	CONSTRAINT "redemptions_credit_ledger_entry_id_unique" UNIQUE("credit_ledger_entry_id"),
	CONSTRAINT "redemptions_credit_amount_positive" CHECK ("redemptions"."credit_amount" > 0)
);
--> statement-breakpoint
ALTER TABLE "credit_ledger_entries" DROP CONSTRAINT "credit_ledger_entries_reason_check";--> statement-breakpoint
ALTER TABLE "barista_trusted_devices" ADD CONSTRAINT "barista_trusted_devices_cafe_id_cafes_id_fk" FOREIGN KEY ("cafe_id") REFERENCES "public"."cafes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cafe_barista_credentials" ADD CONSTRAINT "cafe_barista_credentials_cafe_id_cafes_id_fk" FOREIGN KEY ("cafe_id") REFERENCES "public"."cafes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "redemption_codes" ADD CONSTRAINT "redemption_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "redemption_codes" ADD CONSTRAINT "redemption_codes_cafe_id_cafes_id_fk" FOREIGN KEY ("cafe_id") REFERENCES "public"."cafes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "redemption_codes" ADD CONSTRAINT "redemption_codes_drink_id_drinks_id_fk" FOREIGN KEY ("drink_id") REFERENCES "public"."drinks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "redemptions" ADD CONSTRAINT "redemptions_redemption_code_id_redemption_codes_id_fk" FOREIGN KEY ("redemption_code_id") REFERENCES "public"."redemption_codes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "redemptions" ADD CONSTRAINT "redemptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "redemptions" ADD CONSTRAINT "redemptions_cafe_id_cafes_id_fk" FOREIGN KEY ("cafe_id") REFERENCES "public"."cafes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "redemptions" ADD CONSTRAINT "redemptions_drink_id_drinks_id_fk" FOREIGN KEY ("drink_id") REFERENCES "public"."drinks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "redemptions" ADD CONSTRAINT "redemptions_credit_ledger_entry_id_credit_ledger_entries_id_fk" FOREIGN KEY ("credit_ledger_entry_id") REFERENCES "public"."credit_ledger_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "redemptions" ADD CONSTRAINT "redemptions_barista_trusted_device_id_barista_trusted_devices_id_fk" FOREIGN KEY ("barista_trusted_device_id") REFERENCES "public"."barista_trusted_devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "barista_trusted_devices_cafe_id_idx" ON "barista_trusted_devices" USING btree ("cafe_id");--> statement-breakpoint
CREATE INDEX "redemption_codes_user_id_idx" ON "redemption_codes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "redemption_codes_cafe_id_idx" ON "redemption_codes" USING btree ("cafe_id");--> statement-breakpoint
CREATE INDEX "redemptions_user_id_idx" ON "redemptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "redemptions_cafe_id_idx" ON "redemptions" USING btree ("cafe_id");--> statement-breakpoint
CREATE INDEX "redemptions_redeemed_at_idx" ON "redemptions" USING btree ("redeemed_at");--> statement-breakpoint
ALTER TABLE "credit_ledger_entries" ADD CONSTRAINT "credit_ledger_entries_reason_check" CHECK ("credit_ledger_entries"."reason" in ('monthly_grant', 'redemption'));