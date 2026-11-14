CREATE TYPE "public"."reminder_kind" AS ENUM('dueSoon', 'overdue');--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'taskNoAssignee' BEFORE 'roleGranted';--> statement-breakpoint
CREATE TABLE "task_reminders" (
	"task_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" "reminder_kind" NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_reminders_task_id_user_id_kind_due_at_pk" PRIMARY KEY("task_id","user_id","kind","due_at")
);
--> statement-breakpoint
CREATE TABLE "weekly_digests" (
	"user_id" uuid NOT NULL,
	"week_start" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "weekly_digests_user_id_week_start_pk" PRIMARY KEY("user_id","week_start")
);
--> statement-breakpoint
ALTER TABLE "task_reminders" ADD CONSTRAINT "task_reminders_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_reminders" ADD CONSTRAINT "task_reminders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_digests" ADD CONSTRAINT "weekly_digests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;