import { Logger } from '@nestjs/common';

export class JsonParserUtil {
  static parse(content: string, logger?: Logger): unknown {
    try {
      const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[1]);
      }

      const jsonObjectMatch = content.match(/\{[\s\S]*\}/);
      if (jsonObjectMatch) {
        return JSON.parse(jsonObjectMatch[0]);
      }

      return JSON.parse(content);
    } catch (error) {
      if (logger) {
        logger.error('Failed to parse JSON response from LLM', error);
      }
      throw new Error('Invalid JSON response from LLM');
    }
  }
}
