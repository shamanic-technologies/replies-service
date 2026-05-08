-- Nuke legacy schema (qualification_requests / qualifications / webhook_callbacks
-- and unused tasks/orgs/users tables from earlier scaffolding).
-- DROP IF EXISTS is no-op on a fresh DB.
DROP TABLE IF EXISTS "webhook_callbacks" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "qualifications" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "qualification_requests" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "tasks_runs_costs" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "tasks_runs" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "tasks" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "users" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "orgs" CASCADE;--> statement-breakpoint
DROP TYPE IF EXISTS "public"."classification";--> statement-breakpoint
CREATE TYPE "public"."journalist_reply_source" AS ENUM('auto', 'manual');--> statement-breakpoint
CREATE TYPE "public"."journalist_reply_status" AS ENUM('positive_for_earned', 'positive_for_paid', 'earned_publication_confirmed', 'paid_publication_confirmed', 'more_info_asked', 'not_interested', 'unsubscribe', 'out_of_office', 'bounced', 'other');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "journalist_replies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"journalist_id" text NOT NULL,
	"campaign_id" text NOT NULL,
	"brand_id" text NOT NULL,
	"org_id" text NOT NULL,
	"user_id" text,
	"parent_run_id" text,
	"run_id" text,
	"status" "journalist_reply_status" NOT NULL,
	"source" "journalist_reply_source" NOT NULL,
	"set_by_user_id" text,
	"note" text,
	"from_email" text,
	"to_email" text,
	"subject" text,
	"body_text" text,
	"body_html" text,
	"in_reply_to_message_id" text,
	"email_received_at" timestamp with time zone,
	"publication_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_jr_journalist_campaign" ON "journalist_replies" USING btree ("journalist_id","campaign_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_jr_brand" ON "journalist_replies" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_jr_org" ON "journalist_replies" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_jr_status" ON "journalist_replies" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_jr_source" ON "journalist_replies" USING btree ("source");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_jr_brand_status" ON "journalist_replies" USING btree ("brand_id","status");