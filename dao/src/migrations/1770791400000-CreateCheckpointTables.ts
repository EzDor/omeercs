import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCheckpointTables1770791400000 implements MigrationInterface {
  name = 'CreateCheckpointTables1770791400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "app"."checkpoint_migrations" (
        v INTEGER PRIMARY KEY
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "app"."checkpoints" (
        thread_id TEXT NOT NULL,
        checkpoint_ns TEXT NOT NULL DEFAULT '',
        checkpoint_id TEXT NOT NULL,
        parent_checkpoint_id TEXT,
        type TEXT,
        checkpoint JSONB NOT NULL,
        metadata JSONB NOT NULL DEFAULT '{}',
        PRIMARY KEY (thread_id, checkpoint_ns, checkpoint_id)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "app"."checkpoint_blobs" (
        thread_id TEXT NOT NULL,
        checkpoint_ns TEXT NOT NULL DEFAULT '',
        channel TEXT NOT NULL,
        version TEXT NOT NULL,
        type TEXT NOT NULL,
        blob BYTEA,
        PRIMARY KEY (thread_id, checkpoint_ns, channel, version)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "app"."checkpoint_writes" (
        thread_id TEXT NOT NULL,
        checkpoint_ns TEXT NOT NULL DEFAULT '',
        checkpoint_id TEXT NOT NULL,
        task_id TEXT NOT NULL,
        idx INTEGER NOT NULL,
        channel TEXT NOT NULL,
        type TEXT,
        blob BYTEA NOT NULL,
        PRIMARY KEY (thread_id, checkpoint_ns, checkpoint_id, task_id, idx)
      )
    `);

    await queryRunner.query(`
      INSERT INTO "app"."checkpoint_migrations" (v) VALUES (1), (2), (3), (4), (5)
      ON CONFLICT (v) DO NOTHING
    `);

    await queryRunner.query(`GRANT ALL PRIVILEGES ON TABLE "app"."checkpoint_migrations" TO app_user`);
    await queryRunner.query(`GRANT ALL PRIVILEGES ON TABLE "app"."checkpoints" TO app_user`);
    await queryRunner.query(`GRANT ALL PRIVILEGES ON TABLE "app"."checkpoint_blobs" TO app_user`);
    await queryRunner.query(`GRANT ALL PRIVILEGES ON TABLE "app"."checkpoint_writes" TO app_user`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "app"."checkpoint_writes"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "app"."checkpoint_blobs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "app"."checkpoints"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "app"."checkpoint_migrations"`);
  }
}
