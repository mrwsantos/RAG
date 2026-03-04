# 🚀 RAG System - Next.js + Pinecone + LangChain + LangSmith

## Estrutura do Projeto

```
rag-system/
├── app/
│   ├── api/
│   │   ├── chat/route.ts          ← API do chat com streaming
│   │   └── ingest/route.ts        ← API de upload de documentos
│   ├── chat/page.tsx              ← Interface do chat
│   └── layout.tsx
├── lib/
│   ├── pinecone.ts                ← Config Pinecone
│   ├── langchain.ts               ← Pipeline RAG
│   └── langsmith.ts               ← Config monitoramento
├── components/
│   └── ChatInterface.tsx          ← Componente do chat
└── .env.local                     ← Suas chaves de API
```

## Passo 1 — Crie o projeto Next.js

```bash
npx create-next-app@latest meu-rag --typescript --tailwind --app
cd meu-rag
```

## Passo 2 — Instale as dependências

```bash
npm install @pinecone-database/pinecone \
  langchain \
  @langchain/openai \
  @langchain/anthropic \
  @langchain/community \
  @langchain/pinecone \
  @langchain/core \
  langsmith \
  pdf-parse \
  mammoth \
  ai
```

## Passo 3 — Configure as variáveis de ambiente (.env.local)

```env
# OpenAI
OPENAI_API_KEY=sk-...

# Anthropic (opcional)
ANTHROPIC_API_KEY=sk-ant-...

# Pinecone
PINECONE_API_KEY=...
PINECONE_INDEX_NAME=meu-rag

# LangSmith
LANGCHAIN_TRACING_V2=true
LANGCHAIN_API_KEY=ls__...
LANGCHAIN_PROJECT=meu-rag-producao

# LLM padrão: openai ou anthropic
DEFAULT_LLM=openai
```

## Passo 4 — Crie o índice no Pinecone

1. Acesse https://app.pinecone.io
2. Crie um índice com:
   - **Dimensions**: 1536 (OpenAI text-embedding-3-small)
   - **Metric**: cosine
   - **Name**: meu-rag

## Passo 5 — Deploy na Vercel

```bash
npm install -g vercel
vercel
# Adicione as env vars no dashboard da Vercel também
```

## Como funciona o fluxo

### Upload de documentos:
POST /api/ingest → LangChain processa PDF/DOCX → chunks → embeddings → Pinecone

### Chat:
POST /api/chat → embed pergunta → busca Pinecone → monta contexto → LLM → streaming

### Monitoramento:
Todo trace vai para LangSmith automaticamente. Acesse: https://smith.langchain.com
