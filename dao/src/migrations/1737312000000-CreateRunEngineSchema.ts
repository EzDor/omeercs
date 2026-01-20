import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateRunEngineSchema1737312000000 implements MigrationInterface {
  name = 'CreateRunEngineSchema1737312000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create runs table
    await queryRunner.query(`
      CREATE TABLE "app"."runs" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" character varying(255) NOT NULL,
        "workflow_name" character varying(255) NOT NULL,
        "workflow_version" character varying(50) NOT NULL,
        "trigger_type" character varying(20) NOT NULL,
        "trigger_payload" jsonb,
        "status" character varying(20) NOT NULL DEFAULT 'queued',
        "base_run_id" uuid,
        "error" jsonb,
        "started_at" TIMESTAMP WITH TIME ZONE,
        "completed_at" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "CHK_runs_trigger_type" CHECK (trigger_type IN ('initial', 'update')),
        CONSTRAINT "CHK_runs_status" CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
        CONSTRAINT "CHK_runs_base_run_id" CHECK (
          (trigger_type = 'initial' AND base_run_id IS NULL) OR
          (trigger_type = 'update' AND base_run_id IS NOT NULL)
        ),
        CONSTRAINT "PK_runs_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_runs_base_run" FOREIGN KEY ("base_run_id") REFERENCES "app"."runs"("id") ON DELETE SET NULL
      )
    `);

    // Create indexes for runs
    await queryRunner.query(`CREATE INDEX "IDX_runs_tenant_id" ON "app"."runs" ("tenant_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_runs_tenant_status" ON "app"."runs" ("tenant_id", "status")`);
    await queryRunner.query(`CREATE INDEX "IDX_runs_tenant_workflow" ON "app"."runs" ("tenant_id", "workflow_name")`);
    await queryRunner.query(`CREATE INDEX "IDX_runs_base_run" ON "app"."runs" ("base_run_id") WHERE base_run_id IS NOT NULL`);

    // Create run_steps table
    await queryRunner.query(`
      CREATE TABLE "app"."run_steps" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "run_id" uuid NOT NULL,
        "tenant_id" character varying(255) NOT NULL,
        "step_id" character varying(255) NOT NULL,
        "skill_id" character varying(255) NOT NULL,
        "status" character varying(20) NOT NULL DEFAULT 'pending',
        "input_hash" character varying(64) NOT NULL,
        "attempt" integer NOT NULL DEFAULT 1,
        "output_artifact_ids" jsonb,
        "error" jsonb,
        "started_at" TIMESTAMP WITH TIME ZONE,
        "ended_at" TIMESTAMP WITH TIME ZONE,
        "duration_ms" integer,
        "cache_hit" boolean NOT NULL DEFAULT false,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "CHK_run_steps_status" CHECK (status IN ('pending', 'running', 'skipped', 'completed', 'failed')),
        CONSTRAINT "PK_run_steps_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_run_step" UNIQUE ("run_id", "step_id"),
        CONSTRAINT "FK_run_steps_run" FOREIGN KEY ("run_id") REFERENCES "app"."runs"("id") ON DELETE CASCADE
      )
    `);

    // Create indexes for run_steps
    await queryRunner.query(`CREATE INDEX "IDX_run_steps_tenant_id" ON "app"."run_steps" ("tenant_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_run_steps_run_status" ON "app"."run_steps" ("run_id", "status")`);
    await queryRunner.query(`CREATE INDEX "IDX_run_steps_tenant_run" ON "app"."run_steps" ("tenant_id", "run_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_run_steps_input_hash" ON "app"."run_steps" ("step_id", "input_hash")`);

    // Create step_cache table
    await queryRunner.query(`
      CREATE TABLE "app"."step_cache" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "cache_key" character varying(512) NOT NULL,
        "tenant_id" character varying(255) NOT NULL,
        "workflow_name" character varying(255) NOT NULL,
        "step_id" character varying(255) NOT NULL,
        "input_hash" character varying(64) NOT NULL,
        "artifact_ids" jsonb NOT NULL,
        "scope" character varying(20) NOT NULL DEFAULT 'global',
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "CHK_step_cache_scope" CHECK (scope IN ('global', 'run_only')),
        CONSTRAINT "PK_step_cache_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_step_cache_key" UNIQUE ("cache_key")
      )
    `);

    // Create indexes for step_cache
    await queryRunner.query(`CREATE INDEX "IDX_step_cache_tenant" ON "app"."step_cache" ("tenant_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_step_cache_lookup" ON "app"."step_cache" ("workflow_name", "step_id", "input_hash")`);

    // Create update trigger function if not exists
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);

    // Create triggers for updated_at
    await queryRunner.query(`
      CREATE TRIGGER update_runs_updated_at
        BEFORE UPDATE ON "app"."runs"
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()
    `);

    await queryRunner.query(`
      CREATE TRIGGER update_run_steps_updated_at
        BEFORE UPDATE ON "app"."run_steps"
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()
    `);

    await queryRunner.query(`
      CREATE TRIGGER update_step_cache_updated_at
        BEFORE UPDATE ON "app"."step_cache"
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop triggers
    await queryRunner.query(`DROP TRIGGER IF EXISTS update_step_cache_updated_at ON "app"."step_cache"`);
    await queryRunner.query(`DROP TRIGGER IF EXISTS update_run_steps_updated_at ON "app"."run_steps"`);
    await queryRunner.query(`DROP TRIGGER IF EXISTS update_runs_updated_at ON "app"."runs"`);

    // Drop indexes for step_cache
    await queryRunner.query(`DROP INDEX IF EXISTS "app"."IDX_step_cache_lookup"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "app"."IDX_step_cache_tenant"`);

    // Drop step_cache table
    await queryRunner.query(`DROP TABLE IF EXISTS "app"."step_cache"`);

    // Drop indexes for run_steps
    await queryRunner.query(`DROP INDEX IF EXISTS "app"."IDX_run_steps_input_hash"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "app"."IDX_run_steps_tenant_run"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "app"."IDX_run_steps_run_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "app"."IDX_run_steps_tenant_id"`);

    // Drop run_steps table
    await queryRunner.query(`DROP TABLE IF EXISTS "app"."run_steps"`);

    // Drop indexes for runs
    await queryRunner.query(`DROP INDEX IF EXISTS "app"."IDX_runs_base_run"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "app"."IDX_runs_tenant_workflow"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "app"."IDX_runs_tenant_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "app"."IDX_runs_tenant_id"`);

    // Drop runs table
    await queryRunner.query(`DROP TABLE IF EXISTS "app"."runs"`);
  }
}
