CREATE TABLE "cafes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"perk_line" text,
	"neighborhood" text NOT NULL,
	"address" text NOT NULL,
	"latitude" numeric(9, 6) NOT NULL,
	"longitude" numeric(9, 6) NOT NULL,
	"photos" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"vibe_tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"hours" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"featured" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drinks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cafe_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"category" text,
	"photo_url" text,
	"retail_price_cents" integer NOT NULL,
	"credit_price" integer NOT NULL,
	"signature" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "drinks" ADD CONSTRAINT "drinks_cafe_id_cafes_id_fk" FOREIGN KEY ("cafe_id") REFERENCES "public"."cafes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cafes_neighborhood_idx" ON "cafes" USING btree ("neighborhood");--> statement-breakpoint
CREATE INDEX "cafes_featured_idx" ON "cafes" USING btree ("featured");--> statement-breakpoint
CREATE INDEX "drinks_cafe_id_idx" ON "drinks" USING btree ("cafe_id");--> statement-breakpoint
CREATE INDEX "drinks_signature_idx" ON "drinks" USING btree ("signature");