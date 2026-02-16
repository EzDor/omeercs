import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAiGenerationTable1771218568471 implements MigrationInterface {
  name = 'CreateAiGenerationTable1771218568471';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "app"."ai_generations" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" character varying(255) NOT NULL,
        "campaign_id" uuid,
        "user_id" character varying(255) NOT NULL,
        "generation_type" character varying(30) NOT NULL,
        "status" character varying(20) NOT NULL DEFAULT 'completed',
        "accepted" boolean NOT NULL DEFAULT false,
        "input_params" jsonb NOT NULL,
        "output" jsonb,
        "error" jsonb,
        "duration_ms" integer,
        "llm_model" character varying(100),
        "attempts" integer NOT NULL DEFAULT 1,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_ai_generations" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_ai_generations_type" CHECK (generation_type IN ('plan', 'copy', 'theme_brief', 'theme_image')),
        CONSTRAINT "CHK_ai_generations_status" CHECK (status IN ('pending', 'completed', 'failed'))
      )
    `);

    await queryRunner.query(`CREATE INDEX "IDX_ai_generations_tenant_id" ON "app"."ai_generations" ("tenant_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_ai_generations_tenant_campaign" ON "app"."ai_generations" ("tenant_id", "campaign_id") WHERE "campaign_id" IS NOT NULL`);
    await queryRunner.query(`CREATE INDEX "IDX_ai_generations_tenant_type" ON "app"."ai_generations" ("tenant_id", "generation_type")`);
    await queryRunner.query(`CREATE INDEX "IDX_ai_generations_tenant_created" ON "app"."ai_generations" ("tenant_id", "created_at" DESC)`);

    await queryRunner.query(`
      ALTER TABLE "app"."ai_generations"
      ADD CONSTRAINT "FK_ai_generations_campaign"
      FOREIGN KEY ("campaign_id") REFERENCES "app"."campaigns"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "app"."ai_generations" DROP CONSTRAINT "FK_ai_generations_campaign"`);
    await queryRunner.query(`DROP INDEX "app"."IDX_ai_generations_tenant_created"`);
    await queryRunner.query(`DROP INDEX "app"."IDX_ai_generations_tenant_type"`);
    await queryRunner.query(`DROP INDEX "app"."IDX_ai_generations_tenant_campaign"`);
    await queryRunner.query(`DROP INDEX "app"."IDX_ai_generations_tenant_id"`);
    await queryRunner.query(`DROP TABLE "app"."ai_generations"`);
  }
}
