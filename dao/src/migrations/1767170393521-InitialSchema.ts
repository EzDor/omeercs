import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1767170393521 implements MigrationInterface {
  name = 'InitialSchema1767170393521';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TYPE "app"."chat_messages_role_enum" AS ENUM('user', 'assistant')`);
    await queryRunner.query(
      `CREATE TABLE "app"."chat_messages" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "session_id" uuid NOT NULL, "role" "app"."chat_messages_role_enum" NOT NULL, "content" text NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_40c55ee0e571e268b0d3cd37d10" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_0672782561e44d43febcfba298" ON "app"."chat_messages" ("session_id") `);
    await queryRunner.query(`CREATE INDEX "IDX_34bfc66e62161622b54ac9af4a" ON "app"."chat_messages" ("session_id", "created_at") `);
    await queryRunner.query(
      `CREATE TABLE "app"."chat_sessions" ("tenant_id" character varying(255) NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" character varying(255) NOT NULL, "title" character varying(500), "last_message_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_efc151a4aafa9a28b73dedc485f" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_e56b32c0815c136c110e3d34f9" ON "app"."chat_sessions" ("tenant_id") `);
    await queryRunner.query(`CREATE INDEX "IDX_1fa209cf48ae975a109366542a" ON "app"."chat_sessions" ("user_id") `);
    await queryRunner.query(`CREATE INDEX "IDX_081180d081c4dcfdce411bad92" ON "app"."chat_sessions" ("last_message_at") `);
    await queryRunner.query(`CREATE INDEX "IDX_f939ff4d7ce810ed279902e2c0" ON "app"."chat_sessions" ("tenant_id", "user_id") `);
    await queryRunner.query(
      `ALTER TABLE "app"."chat_messages" ADD CONSTRAINT "FK_0672782561e44d43febcfba2984" FOREIGN KEY ("session_id") REFERENCES "app"."chat_sessions"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "app"."chat_messages" DROP CONSTRAINT "FK_0672782561e44d43febcfba2984"`);
    await queryRunner.query(`DROP INDEX "app"."IDX_f939ff4d7ce810ed279902e2c0"`);
    await queryRunner.query(`DROP INDEX "app"."IDX_081180d081c4dcfdce411bad92"`);
    await queryRunner.query(`DROP INDEX "app"."IDX_1fa209cf48ae975a109366542a"`);
    await queryRunner.query(`DROP INDEX "app"."IDX_e56b32c0815c136c110e3d34f9"`);
    await queryRunner.query(`DROP TABLE "app"."chat_sessions"`);
    await queryRunner.query(`DROP INDEX "app"."IDX_34bfc66e62161622b54ac9af4a"`);
    await queryRunner.query(`DROP INDEX "app"."IDX_0672782561e44d43febcfba298"`);
    await queryRunner.query(`DROP TABLE "app"."chat_messages"`);
    await queryRunner.query(`DROP TYPE "app"."chat_messages_role_enum"`);
  }
}
