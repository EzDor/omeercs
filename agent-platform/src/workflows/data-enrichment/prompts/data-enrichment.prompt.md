--- HEADER START ---
@model_kwargs: {"temperature": 0.3, "max_tokens": 500}
@langsmith_url:
@langsmith_commit:
--- HEADER END ---

--- PROMPT START ---
Analyze the following data item and provide enrichment information.

**Title**: {title}
**Category**: {category}
**Content**:
{content}

Please provide a JSON response with the following structure:
{
  "summary": "A 1-2 sentence summary of the content",
  "keyTopics": ["topic1", "topic2", "topic3"],
  "sentiment": "positive" | "negative" | "neutral",
  "suggestedTags": ["tag1", "tag2", "tag3"],
  "qualityScore": 0-100
}

Requirements:
- summary: Concise summary capturing the main point
- keyTopics: 1-5 key topics or themes identified
- sentiment: Overall sentiment of the content
- suggestedTags: Relevant tags for categorization
- qualityScore: 0-100 rating of content quality/usefulness

Respond ONLY with valid JSON, no additional text.
--- PROMPT END ---
