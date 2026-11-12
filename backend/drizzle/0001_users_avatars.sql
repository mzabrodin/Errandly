ALTER TABLE "users" RENAME COLUMN "avatar_url" TO "provider_avatar_url";--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "uploaded_avatar_key" text;
