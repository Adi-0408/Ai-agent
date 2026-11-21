/**
 * ==============================================================================
 * LANGCHAIN.JS INTEGRATION ADAPTER
 * ==============================================================================
 * Standardizes document processing, prompts, tools, and retrieval chains
 * using official @langchain/core primitives.
 *
 * Integrates:
 *   - Document modeling & recursive chunking (@langchain/core/documents)
 *   - Chat Prompt Templates & Guardrails (@langchain/core/prompts)
 *   - Dynamic Structured Tools for Database & RAG (@langchain/core/tools)
 *   - Runnable Sequences for pipeline execution (@langchain/core/runnables)
 * ==============================================================================
 */

import { Document } from '@langchain/core/documents';
import { PromptTemplate, ChatPromptTemplate } from '@langchain/core/prompts';
import { RunnableSequence, RunnableLambda } from '@langchain/core/runnables';
import { DynamicTool } from '@langchain/core/tools';
import { hybridRAGSearch } from './semanticHybridRag.js';
import { planDatabaseQuery, executeStructuredQuery, sanitizeDatabaseRecord } from './dynamicDatabaseEngine.js';

/**
 * Creates a standardized LangChain Document with rich metadata.
 */
export function createLangChainDocument(content = '', metadata = {}) {
  const text = String(content || '').trim();
  const docHash = computeSimpleHash(text);
  return new Document({
    pageContent: text,
    metadata: {
      source: metadata.source || 'knowledge_base',
      chunkId: metadata.chunkId || `chunk_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      agentId: metadata.agentId || 'default_agent',
      tenantId: metadata.tenantId || 'default_tenant',
      title: metadata.title || 'Knowledge Chunk',
      docHash,
      createdAt: metadata.createdAt || new Date().toISOString(),
      ...metadata
    }
  });
}

/**
 * Deterministic hash for incremental indexing and deduplication.
 */
function computeSimpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return `hash_${Math.abs(hash).toString(16)}`;
}

/**
 * LangChain Document Processor for intelligent document ingestion,
 * chunking, deduplication, and metadata enrichment.
 */
export class LangChainDocumentProcessor {
  constructor(options = {}) {
    this.chunkSize = options.chunkSize || 500;
    this.chunkOverlap = options.chunkOverlap || 50;
    this.separators = options.separators || ['\n\n', '\n', '. ', '? ', '! ', '; ', ' '];
  }

  /**
   * Recursively splits a text into standardized LangChain Document chunks.
   */
  splitText(text, metadata = {}) {
    if (!text || typeof text !== 'string') return [];
    const cleanText = text.replace(/\r\n/g, '\n').trim();
    if (!cleanText) return [];

    const rawChunks = this._recursiveSplit(cleanText, this.separators);
    const seenHashes = new Set();
    const documents = [];

    rawChunks.forEach((chunkText, idx) => {
      const trimmed = chunkText.trim();
      if (trimmed.length < 15) return; // filter trivial fragments
      const doc = createLangChainDocument(trimmed, {
        ...metadata,
        chunkIndex: idx,
        totalChunks: rawChunks.length
      });

      if (!seenHashes.has(doc.metadata.docHash)) {
        seenHashes.add(doc.metadata.docHash);
        documents.push(doc);
      }
    });

    return documents;
  }

  _recursiveSplit(text, separators) {
    if (text.length <= this.chunkSize) return [text];
    if (separators.length === 0) {
      // Hard split fallback
      const chunks = [];
      for (let i = 0; i < text.length; i += this.chunkSize - this.chunkOverlap) {
        chunks.push(text.slice(i, i + this.chunkSize));
      }
      return chunks;
    }

    const [currentSep, ...remainingSeps] = separators;
    const parts = text.split(currentSep);
    const result = [];
    let currentChunk = '';

    for (const part of parts) {
      const candidate = currentChunk ? `${currentChunk}${currentSep}${part}` : part;
      if (candidate.length <= this.chunkSize) {
        currentChunk = candidate;
      } else {
        if (currentChunk) result.push(currentChunk);
        if (part.length > this.chunkSize) {
          result.push(...this._recursiveSplit(part, remainingSeps));
          currentChunk = '';
        } else {
          currentChunk = part;
        }
      }
    }
    if (currentChunk) result.push(currentChunk);
    return result;
  }

  /**
   * Ingests an array of heterogeneous records (FAQs, documents, site snippets)
   * into a standardized LangChain Document collection.
   */
  processKnowledgeSources(sources = [], options = {}) {
    const documents = [];
    for (const item of sources) {
      if (!item) continue;
      if (item.q && item.a) {
        // FAQ format
        documents.push(createLangChainDocument(`Question: ${item.q}\nAnswer: ${item.a}`, {
          source: 'faq',
          title: item.q,
          agentId: options.agentId,
          tenantId: options.tenantId
        }));
      } else if (item.content || item.text) {
        // Freeform document or web snippet
        const content = item.content || item.text;
        const subDocs = this.splitText(content, {
          source: item.source || item.title || 'document',
          title: item.title || item.heading || 'Document Section',
          agentId: options.agentId,
          tenantId: options.tenantId
        });
        documents.push(...subDocs);
      }
    }
    return documents;
  }
}

/**
 * Creates a LangChain DynamicTool for querying live database records
 * with strict sanitization and zero credential/schema leakage.
 */
export function createLangChainDatabaseTool(schema, dbRecords = [], options = {}) {
  return new DynamicTool({
    name: 'live_database_query',
    description: 'Executes safe, structured, read-only queries against live business database records (counts, availability, seat checks, fees, prices).',
    func: async (inputQuery) => {
      try {
        const queryText = typeof inputQuery === 'string' ? inputQuery : (inputQuery?.query || '');
        const plan = planDatabaseQuery(queryText, schema);
        if (!plan) {
          return JSON.stringify({
            executed: false,
            message: 'No applicable structured database operation matched this inquiry.'
          });
        }

        const tableRows = Array.isArray(dbRecords) ? dbRecords : (dbRecords[plan.table] || []);
        const result = executeStructuredQuery(plan, tableRows, options.queryLang || 'en-US');

        if (!result || !result.success) {
          return JSON.stringify({
            executed: false,
            message: result?.summaryText || 'Record lookup returned no results.'
          });
        }

        // Return strictly authorized, minimal summary without raw internal objects
        return JSON.stringify({
          executed: true,
          operation: result.operation,
          table: result.table,
          summaryText: result.summaryText,
          // Sanitized public metrics only
          publicData: result.computedData?.formatted || result.computedData?.count || result.computedData?.stock || null
        });
      } catch (err) {
        return JSON.stringify({
          executed: false,
          error: 'Database query execution failed safely.'
        });
      }
    }
  });
}

/**
 * Creates a LangChain DynamicTool for Hybrid RAG Retrieval.
 */
export function createLangChainRagTool(corpus = [], options = {}) {
  return new DynamicTool({
    name: 'hybrid_rag_search',
    description: 'Searches verified knowledge base documents using hybrid BM25 + dense semantic vector retrieval and cross-encoder reranking.',
    func: async (inputQuery) => {
      try {
        const queryText = typeof inputQuery === 'string' ? inputQuery : (inputQuery?.query || '');
        const searchResult = hybridRAGSearch(queryText, corpus, {
          topK: options.topK || 5,
          relevanceThreshold: options.relevanceThreshold || 0.42
        });

        return JSON.stringify({
          matched: searchResult.topMatches.length > 0,
          confidence: searchResult.confidence,
          results: searchResult.topMatches.map(m => ({
            id: m.id,
            title: m.title,
            content: m.content,
            score: m.finalScore
          }))
        });
      } catch (err) {
        return JSON.stringify({ matched: false, results: [], error: err.message });
      }
    }
  });
}

/**
 * Creates a standardized LangChain ChatPromptTemplate with strict grounding
 * and prompt injection defense.
 */
export function createLangChainPromptTemplate(options = {}) {
  const {
    agentName = 'Echo AI Agent',
    role = 'Official AI Assistant',
    companyName = 'our organization',
    queryLang = 'en-US'
  } = options;

  const langDirective = queryLang === 'mr-IN'
    ? 'ACTIVE TURN LANGUAGE: Marathi (मराठी, Devanagari script). Reply strictly in natural, polite Marathi.'
    : queryLang === 'hi-IN'
      ? 'ACTIVE TURN LANGUAGE: Hindi (हिंदी, Devanagari script). Reply strictly in natural, polite Hindi.'
      : 'ACTIVE TURN LANGUAGE: English.';

  const systemMessage = `You are {agentName}, the official {role} for {companyName}.

CRITICAL POLICY:
1. ${langDirective}
2. GROUNDING & ZERO HALLUCINATION:
   - Base all factual answers solely on the provided verified context.
   - If the verified context does not contain the answer, politely acknowledge that you do not have that information.
   - Never fabricate fees, deadlines, admission criteria, or inventory numbers.
3. DATA PROTECTION:
   - Never expose internal database schemas, primary key hashes, private customer data, or internal system configurations.
4. TONE: Direct, polite, concise (2-4 sentences).

<verified_context>
{context}
</verified_context>`;

  return ChatPromptTemplate.fromMessages([
    ['system', systemMessage],
    ['human', '{input}']
  ]);
}

/**
 * Constructs a LangChain RunnableSequence pipeline for end-to-end execution.
 */
export function createLangChainRagChain(components = {}) {
  const { promptTemplate, ragTool, dbTool, llmCaller } = components;

  const chain = RunnableSequence.from([
    // Step 1: Input preparation & Tool dispatch
    new RunnableLambda({
      func: async (input) => {
        const query = typeof input === 'string' ? input : input.query;
        let dbContext = '';
        let ragContext = '';

        if (dbTool) {
          const rawDb = await dbTool.invoke(query);
          try {
            const parsedDb = JSON.parse(rawDb);
            if (parsedDb.executed && parsedDb.summaryText) {
              dbContext = `[AUTHORITATIVE_DATABASE_FACT]: ${parsedDb.summaryText}`;
            }
          } catch (e) {}
        }

        if (ragTool) {
          const rawRag = await ragTool.invoke(query);
          try {
            const parsedRag = JSON.parse(rawRag);
            if (parsedRag.matched && Array.isArray(parsedRag.results)) {
              ragContext = parsedRag.results.map(r => `[Source: ${r.title}]\n${r.content}`).join('\n\n');
            }
          } catch (e) {}
        }

        const combinedContext = [dbContext, ragContext].filter(Boolean).join('\n\n') ||
          '[NO_VERIFIED_CONTEXT_AVAILABLE_FOR_THIS_QUERY]';

        return {
          agentName: input.agentName || 'Echo AI Agent',
          role: input.role || 'Assistant',
          companyName: input.companyName || 'our store',
          context: combinedContext,
          input: query,
          hasGrounding: Boolean(dbContext || ragContext)
        };
      }
    }),

    // Step 2: Format prompt with guardrails
    new RunnableLambda({
      func: async (prepared) => {
        const formattedPrompt = await promptTemplate.formatMessages({
          agentName: prepared.agentName,
          role: prepared.role,
          companyName: prepared.companyName,
          context: prepared.context,
          input: prepared.input
        });
        return {
          messages: formattedPrompt,
          hasGrounding: prepared.hasGrounding,
          input: prepared.input
        };
      }
    }),

    // Step 3: LLM execution
    new RunnableLambda({
      func: async ({ messages, hasGrounding, input }) => {
        if (typeof llmCaller === 'function') {
          return await llmCaller({ messages, hasGrounding, input });
        }
        return { reply: 'LLM caller not configured.' };
      }
    })
  ]);

  return chain;
}
