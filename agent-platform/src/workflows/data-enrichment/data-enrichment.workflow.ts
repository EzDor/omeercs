import { Injectable, Logger } from '@nestjs/common';
import { StateGraph } from '@langchain/langgraph';
import { DataEnrichmentState, DataEnrichmentStateType } from './interfaces/data-enrichment-state.interface';
import { DataLoaderService } from './services/data-loader.service';
import { DataTransformerService } from './services/data-transformer.service';
import { LlmEnrichmentService } from './services/llm-enrichment.service';
import { DataSaverService } from './services/data-saver.service';

@Injectable()
export class DataEnrichmentWorkflow {
  private readonly logger = new Logger(DataEnrichmentWorkflow.name);

  constructor(
    private readonly dataLoader: DataLoaderService,
    private readonly dataTransformer: DataTransformerService,
    private readonly llmEnrichment: LlmEnrichmentService,
    private readonly dataSaver: DataSaverService,
  ) {}

  createGraph(): StateGraph<DataEnrichmentStateType> {
    this.logger.log('Creating data enrichment workflow graph');

    const shouldContinue = (state: DataEnrichmentStateType) => {
      if (state.error) {
        this.logger.error(`Workflow stopping due to error: ${state.error}`);
        return '__end__';
      }
      return 'continue';
    };

    const workflow = new StateGraph(DataEnrichmentState)
      .addNode('loadData', async (state: DataEnrichmentStateType) => await this.dataLoader.loadData(state))
      .addNode('transformData', async (state: DataEnrichmentStateType) => await this.dataTransformer.transformData(state))
      .addNode('enrichWithLlm', async (state: DataEnrichmentStateType) => await this.llmEnrichment.enrichWithLlm(state))
      .addNode('saveResults', async (state: DataEnrichmentStateType) => await this.dataSaver.saveResults(state))
      .addEdge('__start__', 'loadData')
      .addConditionalEdges('loadData', shouldContinue, {
        continue: 'transformData',
        __end__: '__end__',
      })
      .addConditionalEdges('transformData', shouldContinue, {
        continue: 'enrichWithLlm',
        __end__: '__end__',
      })
      .addConditionalEdges('enrichWithLlm', shouldContinue, {
        continue: 'saveResults',
        __end__: '__end__',
      })
      .addEdge('saveResults', '__end__');

    this.logger.log('Data enrichment workflow graph created with 4 stages and error handling');
    return workflow as unknown as StateGraph<DataEnrichmentStateType>;
  }
}
