CREATE TYPE "public"."swap_status" AS ENUM('pending', 'accepted', 'declined', 'cancelled');--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'swapProposed';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'swapAccepted';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'swapDeclined';--> statement-breakpoint
CREATE TABLE "task_swaps" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"group_id" uuid NOT NULL,
	"offered_task_id" uuid NOT NULL,
	"requested_task_id" uuid NOT NULL,
	"proposer_id" uuid NOT NULL,
	"recipient_id" uuid NOT NULL,
	"status" "swap_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	CONSTRAINT "task_swaps_distinct_tasks" CHECK ("task_swaps"."offered_task_id" <> "task_swaps"."requested_task_id"),
	CONSTRAINT "task_swaps_distinct_users" CHECK ("task_swaps"."proposer_id" <> "task_swaps"."recipient_id")
);
--> statement-breakpoint
ALTER TABLE "task_swaps" ADD CONSTRAINT "task_swaps_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_swaps" ADD CONSTRAINT "task_swaps_offered_task_id_tasks_id_fk" FOREIGN KEY ("offered_task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_swaps" ADD CONSTRAINT "task_swaps_requested_task_id_tasks_id_fk" FOREIGN KEY ("requested_task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_swaps" ADD CONSTRAINT "task_swaps_proposer_id_users_id_fk" FOREIGN KEY ("proposer_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_swaps" ADD CONSTRAINT "task_swaps_recipient_id_users_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "task_swaps_pending_key" ON "task_swaps" USING btree ("offered_task_id","requested_task_id") WHERE "task_swaps"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "task_swaps_group_id_idx" ON "task_swaps" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "task_swaps_requested_task_id_idx" ON "task_swaps" USING btree ("requested_task_id");