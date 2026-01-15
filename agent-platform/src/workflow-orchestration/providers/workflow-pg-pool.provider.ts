import { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import { ConfigUtil } from '@agentic-template/common/src/config/config-util';

export const WORKFLOW_PG_POOL = 'WORKFLOW_PG_POOL';

export const WorkflowPgPoolProvider: Provider = {
  provide: WORKFLOW_PG_POOL,
  useFactory: (configService: ConfigService) => {
    const pool = new Pool({
      connectionString: ConfigUtil.getDatabaseUrl(configService),
      ssl: ConfigUtil.getDatabaseSslConfig(configService),
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });

    return pool;
  },
  inject: [ConfigService],
};
