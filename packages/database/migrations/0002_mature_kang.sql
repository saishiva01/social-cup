CREATE TABLE "ratings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"drink_id" uuid NOT NULL,
	"stars" integer NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ratings_stars_range" CHECK ("ratings"."stars" between 1 and 5),
	CONSTRAINT "ratings_note_length" CHECK (char_length("ratings"."note") <= 140)
);
--> statement-breakpoint
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_drink_id_drinks_id_fk" FOREIGN KEY ("drink_id") REFERENCES "public"."drinks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ratings_user_drink_unique" ON "ratings" USING btree ("user_id","drink_id");--> statement-breakpoint
CREATE INDEX "ratings_drink_id_idx" ON "ratings" USING btree ("drink_id");--> statement-breakpoint
CREATE INDEX "ratings_user_id_idx" ON "ratings" USING btree ("user_id");