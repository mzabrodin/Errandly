ALTER TABLE "task_series" ADD COLUMN "timezone" text DEFAULT 'Europe/Kyiv' NOT NULL;--> statement-breakpoint
ALTER TABLE "task_series" ADD COLUMN "ended_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "task_series" ADD COLUMN "assignee_id" uuid;--> statement-breakpoint
ALTER TABLE "task_series" ADD CONSTRAINT "task_series_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;