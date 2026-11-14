CREATE TABLE "calendar_settings" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"reminder_minutes" smallint DEFAULT 60 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "calendar_settings_reminder_positive" CHECK ("calendar_settings"."reminder_minutes" > 0)
);
--> statement-breakpoint
ALTER TABLE "notification_settings" ALTER COLUMN "reminder_minutes" SET DEFAULT 1440;--> statement-breakpoint
ALTER TABLE "calendar_connections" ALTER COLUMN "calendar_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "calendar_settings" ADD CONSTRAINT "calendar_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_connections" DROP COLUMN "access_token_encrypted";--> statement-breakpoint
ALTER TABLE "calendar_connections" DROP COLUMN "access_token_expires_at";