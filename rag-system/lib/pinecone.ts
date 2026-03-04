// lib/pinecone.ts
import { Pinecone } from '@pinecone-database/pinecone';

let pineconeClient: Pinecone | null = null;

export function getPineconeClient(): Pinecone {
  if (!pineconeClient) {
    pineconeClient = new Pinecone({
      apiKey: process.env.PINECONE_API_KEY!,
    });
  }
  return pineconeClient;
}

export function getPineconeIndex() {
  const client = getPineconeClient();
  return client.index(process.env.PINECONE_INDEX_NAME!);
}