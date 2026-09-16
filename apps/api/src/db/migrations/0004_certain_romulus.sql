CREATE TABLE "cost_rollups" (
	"id" uuid PRIMARY KEY NOT NULL,
	"team_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"model_provider" text NOT NULL,
	"model_name" text NOT NULL,
	"bucket_start" timestamp with time zone NOT NULL,
	"bucket_seconds" integer NOT NULL,
	"run_count" integer DEFAULT 0 NOT NULL,
	"input_tokens" bigint DEFAULT 0 NOT NULL,
	"output_tokens" bigint DEFAULT 0 NOT NULL,
	"rolled_up_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cost_rollups_dimension_unique" UNIQUE("team_id","agent_id","model_provider","model_name","bucket_start","bucket_seconds")
);
--> statement-breakpoint
ALTER TABLE "cost_rollups" ADD CONSTRAINT "cost_rollups_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_rollups" ADD CONSTRAINT "cost_rollups_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cost_rollups_team_bucket_idx" ON "cost_rollups" USING btree ("team_id","bucket_start");