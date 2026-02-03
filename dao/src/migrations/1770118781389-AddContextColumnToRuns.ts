import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddContextColumnToRuns1770118781389 implements MigrationInterface {
  name = 'AddContextColumnToRuns1770118781389';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "app"."runs"
      ADD COLUMN "context" jsonb
    `);

    await queryRunner.query(`
      COMMENT ON COLUMN "app"."runs"."context" IS 'CampaignContext JSONB containing artifact refs, artifacts map, and computed data'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "app"."runs"
      DROP COLUMN IF EXISTS "context"
    `);
  }
}
