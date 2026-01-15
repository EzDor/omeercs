import { Injectable, Logger } from '@nestjs/common';
import { DataEnrichmentStateType } from '../interfaces/data-enrichment-state.interface';

@Injectable()
export class DataSaverService {
  private readonly logger = new Logger(DataSaverService.name);

  async saveResults(state: DataEnrichmentStateType): Promise<Partial<DataEnrichmentStateType>> {
    this.logger.log(`Saving ${state.enrichedData.length} enriched data items`);

    try {
      // Mock saving - in real implementation, this would persist to a database
      // Using await to simulate async DB operation
      const savedResultIds: string[] = await Promise.resolve(
        state.enrichedData.map((item) => {
          this.logger.debug(`Saved enriched item: ${item.id} (quality: ${item.enrichment.qualityScore})`);
          return item.id;
        }),
      );

      this.logger.log(`Successfully saved ${savedResultIds.length} results`);

      return {
        savedResultIds,
        currentStep: 'completed',
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error('Failed to save results', error);
      return {
        error: `Data saving failed: ${errorMessage}`,
        currentStep: 'error',
      };
    }
  }
}
