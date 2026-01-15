import { Injectable, Logger } from '@nestjs/common';
import { DataItem } from '../interfaces/data-item.interface';
import { DataEnrichmentStateType } from '../interfaces/data-enrichment-state.interface';

@Injectable()
export class DataTransformerService {
  private readonly logger = new Logger(DataTransformerService.name);

  async transformData(state: DataEnrichmentStateType): Promise<Partial<DataEnrichmentStateType>> {
    this.logger.log(`Transforming ${state.rawData.length} data items`);

    try {
      // Using await to simulate async operation (replace with actual async processing if needed)
      const transformedData: DataItem[] = await Promise.resolve(
        state.rawData.map((item) => ({
          ...item,
          // Normalize title (trim and lowercase for consistent processing)
          title: item.title.trim(),
          // Clean content
          content: this.cleanContent(item.content),
          // Add transformation metadata
          metadata: {
            ...item.metadata,
            transformedAt: new Date().toISOString(),
            originalLength: item.content.length,
          },
        })),
      );

      this.logger.log(`Transformed ${transformedData.length} data items`);

      return {
        transformedData,
        currentStep: 'transformed',
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error('Failed to transform data', error);
      return {
        error: `Data transformation failed: ${errorMessage}`,
        currentStep: 'error',
      };
    }
  }

  private cleanContent(content: string): string {
    return content
      .trim()
      .replace(/\s+/g, ' ') // Normalize whitespace
      .replace(/[^\w\s.,!?-]/g, ''); // Remove special characters
  }
}
