import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDataToStepCache1770791500000 implements MigrationInterface {
  name = 'AddDataToStepCache1770791500000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "app"."step_cache" ADD COLUMN "data" jsonb`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "app"."step_cache" DROP COLUMN "data"`);
  }
}
