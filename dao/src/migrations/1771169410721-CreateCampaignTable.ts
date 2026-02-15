import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCampaignTable1771169410721 implements MigrationInterface {
  name = 'CreateCampaignTable1771169410721';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "app"."campaigns" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" character varying(255) NOT NULL,
        "user_id" character varying(255) NOT NULL,
        "name" character varying(255) NOT NULL,
        "template_id" character varying(100) NOT NULL,
        "status" character varying(20) NOT NULL DEFAULT 'draft',
        "config" jsonb,
        "bundle_url" character varying(2048),
        "thumbnail_url" character varying(2048),
        "latest_run_id" uuid,
        "version" integer NOT NULL DEFAULT 1,
        "deleted_at" TIMESTAMP,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_campaigns" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`CREATE INDEX "IDX_campaigns_tenant_id" ON "app"."campaigns" ("tenant_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_campaigns_tenant_status" ON "app"."campaigns" ("tenant_id", "status")`);
    await queryRunner.query(`CREATE INDEX "IDX_campaigns_tenant_user" ON "app"."campaigns" ("tenant_id", "user_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_campaigns_deleted_at" ON "app"."campaigns" ("deleted_at")`);

    await queryRunner.query(`
      ALTER TABLE "app"."campaigns"
      ADD CONSTRAINT "CHK_campaigns_status"
      CHECK (status IN ('draft', 'generating', 'live', 'failed', 'archived'))
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "app"."campaigns"`);
  }
}
