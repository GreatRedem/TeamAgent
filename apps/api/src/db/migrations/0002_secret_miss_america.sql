CREATE TABLE "knowledge_chunks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"team_id" uuid NOT NULL,
	"knowledge_base_id" uuid NOT NULL,
	"knowledge_item_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	"content" text NOT NULL,
	"char_count" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "knowledge_chunks_item_ordinal_unique" UNIQUE("knowledge_item_id","ordinal")
);
--> statement-breakpoint
ALTER TABLE "knowledge_bases" ADD COLUMN "kind" text;--> statement-breakpoint
ALTER TABLE "knowledge_chunks" ADD CONSTRAINT "knowledge_chunks_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_chunks" ADD CONSTRAINT "knowledge_chunks_knowledge_base_id_knowledge_bases_id_fk" FOREIGN KEY ("knowledge_base_id") REFERENCES "public"."knowledge_bases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_chunks" ADD CONSTRAINT "knowledge_chunks_knowledge_item_id_knowledge_items_id_fk" FOREIGN KEY ("knowledge_item_id") REFERENCES "public"."knowledge_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "knowledge_chunks_base_idx" ON "knowledge_chunks" USING btree ("knowledge_base_id");--> statement-breakpoint
CREATE INDEX "knowledge_chunks_item_idx" ON "knowledge_chunks" USING btree ("knowledge_item_id");