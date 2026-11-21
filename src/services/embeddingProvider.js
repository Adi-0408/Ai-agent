const ENDPOINT = 'https://api.openai.com/v1/embeddings';

export class EmbeddingProvider {
  constructor({ apiKey = process.env.OPENAI_API_KEY, model = process.env.EMBEDDING_MODEL || 'text-embedding-3-small' } = {}) {
    this.apiKey = apiKey;
    this.model = model;
    this.dimension = model === 'text-embedding-3-small' ? 1536 : undefined;
  }
  async embedDocuments(texts = []) {
    if (!this.apiKey) throw new Error('OPENAI_API_KEY is required for semantic embeddings');
    if (!texts.length) return [];
    const response = await fetch(ENDPOINT, {
      method: 'POST', headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: this.model, input: texts, ...(this.dimension ? { dimensions: this.dimension } : {}) })
    });
    if (!response.ok) throw new Error('Embedding provider request failed');
    const payload = await response.json();
    return (payload.data || []).sort((a, b) => a.index - b.index).map(item => item.embedding);
  }
  async embedQuery(text) { return (await this.embedDocuments([text]))[0]; }
}

export function getEmbeddingProvider(options) { return new EmbeddingProvider(options); }
