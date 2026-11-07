CREATE TABLE "notifications" (
	"id" varchar(256) PRIMARY KEY NOT NULL,
	"user_id" varchar(256) NOT NULL,
	"type" varchar(64) NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"link" text,
	"is_read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"read_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"full_name" text,
	"phone" varchar(256)
);
--> statement-breakpoint
CREATE TABLE "workflow_credentials" (
	"id" varchar(256) PRIMARY KEY NOT NULL,
	"type" varchar(64) NOT NULL,
	"label" varchar(256) NOT NULL,
	"scope" varchar(64) NOT NULL,
	"expose_to_browser" boolean DEFAULT false NOT NULL,
	"secret" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"rotated_at" timestamp,
	"revoked_at" timestamp,
	"expires_at" timestamp
);
