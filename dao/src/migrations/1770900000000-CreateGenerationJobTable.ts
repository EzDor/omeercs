import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateGenerationJobTable1770900000000 implements MigrationInterface {
  name = 'CreateGenerationJobTable1770900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS app.generation_jobs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id VARCHAR(255) NOT NULL,
        run_id UUID NOT NULL,
        run_step_id UUID NOT NULL,
        provider_id VARCHAR(100) NOT NULL,
        provider_job_id VARCHAR(255) NOT NULL,
        media_type VARCHAR(50) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        poll_interval_ms INTEGER NOT NULL,
        timeout_ms INTEGER NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        input_params JSONB NOT NULL,
        result_uri VARCHAR(2048),
        artifact_id UUID REFERENCES app.artifacts(id),
        error_message TEXT,
        cost_usd DECIMAL(10,4),
        started_at TIMESTAMP WITH TIME ZONE,
        completed_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`CREATE INDEX idx_generation_jobs_tenant_status ON app.generation_jobs (tenant_id, status)`);
    await queryRunner.query(`CREATE INDEX idx_generation_jobs_provider_status ON app.generation_jobs (provider_id, status)`);
    await queryRunner.query(`CREATE INDEX idx_generation_jobs_run_step ON app.generation_jobs (run_step_id)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS app.idx_generation_jobs_run_step`);
    await queryRunner.query(`DROP INDEX IF EXISTS app.idx_generation_jobs_provider_status`);
    await queryRunner.query(`DROP INDEX IF EXISTS app.idx_generation_jobs_tenant_status`);
    await queryRunner.query(`DROP TABLE IF EXISTS app.generation_jobs`);
  }
}
