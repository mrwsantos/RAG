// lib/langchain.ts
import { ChatOpenAI, OpenAIEmbeddings } from '@langchain/openai';
import { ChatAnthropic } from '@langchain/anthropic';
import { PineconeStore } from '@langchain/pinecone';
import { createRetrievalChain } from 'langchain/chains/retrieval';
import { createStuffDocumentsChain } from 'langchain/chains/combine_documents';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { getPineconeIndex } from './pinecone';

// ── Embeddings (sempre OpenAI para consistência) ──────────────────────────────
export function getEmbeddings() {
  return new OpenAIEmbeddings({
    model: 'text-embedding-3-small',
    apiKey: process.env.OPENAI_API_KEY!,
  });
}

// ── LLM (OpenAI ou Anthropic) ─────────────────────────────────────────────────
export function getLLM(provider: 'openai' | 'anthropic' = 'anthropic') {
  if (provider === 'anthropic') {
    return new ChatAnthropic({
      // model: 'claude-haiku-4-5-20251001',
      model: 'claude-haiku-4-5-20251001',
      apiKey: process.env.ANTHROPIC_API_KEY!,
      streaming: true,
    });
  }
  return new ChatOpenAI({
    // model: 'gpt-oss-120b',
    // model: 'gpt-4o',
    model: 'gpt-5-mini-2025-08-07',
    apiKey: process.env.OPENAI_API_KEY!,
    streaming: true,
  });
}

// ── Vector Store ──────────────────────────────────────────────────────────────
export async function getVectorStore() {
  const index = getPineconeIndex();
  const embeddings = getEmbeddings();
  return PineconeStore.fromExistingIndex(embeddings, { pineconeIndex: index });
}

// ── Prompt do sistema ─────────────────────────────────────────────────────────
// V1 -----------------------------
// const SYSTEM_PROMPT = `You are an assistant specialized in the company's documents.
// Always respond clearly and objectively.
// Use ONLY the information provided in the context below to answer.
// If the answer is not in the context, say: "I couldn't find the answer in the documents, sorry."
// At the end, briefly mention which document the information came from.

// Context:
// {context}

// Tone of voice: clear, concise, professional, helpful.
// `;
const SYSTEM_PROMPT = `You are a copyright information assistant for Copyright Licensing New Zealand (CLNZ).

Answer questions using only the information in the context provided. Do not add advice, recommendations, or information from outside the context. If the context does not contain enough information to answer the question, say: "I couldn't find the answer in our documents, sorry."

Rules:
- Never state facts with more certainty than the source material supports
- Do not speculate or fill gaps with general knowledge
- Where the law has nuances, qualifications, or exceptions, include them
- Do not present legal conclusions as absolute — note when something depends on circumstances or agreement
- Do not suggest workarounds (such as paraphrasing) unless the source material explicitly mentions them
- Do not summarise away important conditions or limitations

Context:
{context}
`;

// ── Chain RAG principal ────────────────────────────────────────────────────────
export async function buildRAGChain(provider: 'openai' | 'anthropic' = 'anthropic') {
  const vectorStore = await getVectorStore();
  const retriever = vectorStore.asRetriever({
    k: 10, // busca os 10 chunks mais relevantes
    searchType: 'similarity',
    // searchType: 'mmr',
  });

  const llm = getLLM(provider);

  const prompt = ChatPromptTemplate.fromMessages([
    ['system', SYSTEM_PROMPT],
    ['human', '{input}'],
  ]);

  const questionAnswerChain = await createStuffDocumentsChain({ llm, prompt });
  const ragChain = await createRetrievalChain({
    retriever,
    combineDocsChain: questionAnswerChain,
  });

  return ragChain;
}