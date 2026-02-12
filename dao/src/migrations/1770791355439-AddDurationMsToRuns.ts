import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDurationMsToRuns1770791355439 implements MigrationInterface {
  name = 'AddDurationMsToRuns1770791355439';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "app"."runs" ADD COLUMN "duration_ms" integer`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "app"."runs" DROP COLUMN "duration_ms"`);
  }
}
