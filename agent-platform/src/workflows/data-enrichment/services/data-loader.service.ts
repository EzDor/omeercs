import { Injectable, Logger } from '@nestjs/common';
import { DataItem } from '../interfaces/data-item.interface';
import { DataEnrichmentStateType } from '../interfaces/data-enrichment-state.interface';

@Injectable()
export class DataLoaderService {
  private readonly logger = new Logger(DataLoaderService.name);

  async loadData(state: DataEnrichmentStateType): Promise<Partial<DataEnrichmentStateType>> {
    this.logger.log(`Loading data for IDs: ${state.inputIds.join(', ')}`);

    try {
      if (!state.inputIds || state.inputIds.length === 0) {
        return {
          error: 'No input IDs provided',
          currentStep: 'error',
        };
      }

      // Mock data loading - in real implementation, this would query a database
      // Using await to simulate async DB operation
      const rawData: DataItem[] = await Promise.resolve(
        state.inputIds.map((id, index) => ({
          id,
          title: `Sample Item ${index + 1}`,
          content: `This is sample content for item ${id}. It contains various information that will be processed and enriched by the workflow pipeline.`,
          category: 'uncategorized',
          metadata: { source: 'mock', index },
          createdAt: new Date(),
        })),
      );

      this.logger.log(`Loaded ${rawData.length} data items`);

      return {
        rawData,
        currentStep: 'loaded',
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error('Failed to load data', error);
      return {
        error: `Data loading failed: ${errorMessage}`,
        currentStep: 'error',
      };
    }
  }
}
