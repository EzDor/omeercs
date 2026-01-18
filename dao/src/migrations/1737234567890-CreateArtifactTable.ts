import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateArtifactTable1737234567890 implements MigrationInterface {
  name = 'CreateArtifactTable1737234567890';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create artifacts table per data-model.md specification
    await queryRunner.query(`
      CREATE TABLE "app"."artifacts" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" character varying(255) NOT NULL,
        "run_id" uuid NOT NULL,
        "skill_id" character varying(64) NOT NULL,
        "type" character varying(100) NOT NULL,
        "uri" character varying(2048) NOT NULL,
        "content_hash" character(64) NOT NULL,
        "size_bytes" bigint NOT NULL,
        "filename" character varying(255),
        "metadata" jsonb,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "CHK_artifacts_size_bytes" CHECK (size_bytes >= 0),
        CONSTRAINT "PK_artifacts_id" PRIMARY KEY ("id")
      )
    `);

    // Create indexes per data-model.md
    await queryRunner.query(`CREATE INDEX "IDX_artifacts_tenant_id" ON "app"."artifacts" ("tenant_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_artifacts_run_id" ON "app"."artifacts" ("run_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_artifacts_skill_id" ON "app"."artifacts" ("skill_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_artifacts_tenant_run" ON "app"."artifacts" ("tenant_id", "run_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "app"."IDX_artifacts_tenant_run"`);
    await queryRunner.query(`DROP INDEX "app"."IDX_artifacts_skill_id"`);
    await queryRunner.query(`DROP INDEX "app"."IDX_artifacts_run_id"`);
    await queryRunner.query(`DROP INDEX "app"."IDX_artifacts_tenant_id"`);
    await queryRunner.query(`DROP TABLE "app"."artifacts"`);
  }
}
