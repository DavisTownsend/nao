CREATE TABLE "project_warehouse_credentials" (
	"project_id" text PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"encrypted_credentials" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_warehouse_credentials" ADD CONSTRAINT "project_warehouse_credentials_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;