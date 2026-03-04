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
      model: 'claude-haiku-4-5-20251001',
      apiKey: process.env.ANTHROPIC_API_KEY!,
      streaming: true,
    });
  }
  return new ChatOpenAI({
    model: 'gpt-4o',
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
const SYSTEM_PROMPT = `You are an assistant specialized in the company's documents.
Always respond clearly and objectively.
Use ONLY the information provided in the context below to answer.
If the answer is not in the context, say: "I couldn't find the answer in the documents, sorry."
At the end, briefly mention which document the information came from.

Document context:
{context}`;

// ── Chain RAG principal ────────────────────────────────────────────────────────
export async function buildRAGChain(provider: 'openai' | 'anthropic' = 'anthropic') {
  const vectorStore = await getVectorStore();
  const retriever = vectorStore.asRetriever({
    k: 5, // busca os 5 chunks mais relevantes
    searchType: 'similarity',
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