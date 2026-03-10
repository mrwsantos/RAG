// lib/ingest.ts
// Shared ingestion pipeline: load → chunk → embed → Pinecone
// Used by both /api/ingest (upload) and /api/ingest-source (local folder)

import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf';
import { DocxLoader } from '@langchain/community/document_loaders/fs/docx';
import { RecursiveCharacterTextSplitter, MarkdownTextSplitter } from 'langchain/text_splitter';
import { PineconeStore } from '@langchain/pinecone';
import { getEmbeddings } from '@/lib/langchain';
import { getPineconeIndex } from '@/lib/pinecone';
import { traceable } from 'langsmith/traceable';
import { writeFile, unlink } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

// ---------------------------------------------------------------------------
// YAML front matter extraction
// ---------------------------------------------------------------------------
export function extractFrontMatter(text: string): { metadata: Record<string, any>; body: string } {
  const match = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { metadata: {}, body: text };

  const metadata: Record<string, any> = {};
  for (const line of match[1].split('\n')) {
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) continue;
    const key = line.slice(0, colonIndex).trim();
    const value = line.slice(colonIndex + 1).trim();
    if (key && value) {
      metadata[key] = key === 'priority_score' ? Number(value) : value;
    }
  }

  return { metadata, body: match[2].trim() };
}

// ---------------------------------------------------------------------------
// Heading-aware block splitter
// ---------------------------------------------------------------------------
export function splitByHeadings(
  text: string,
  baseMetadata: Record<string, any>
): { pageContent: string; metadata: Record<string, any> }[] {
  const HEADING = /^(#{1,3})\s+(.+)/;
  const lines = text.split('\n');

  let h1 = '';
  let h2 = '';
  let h3 = '';

  const sections: { pageContent: string; metadata: Record<string, any> }[] = [];
  let currentLines: string[] = [];

  const flushSection = () => {
    const content = currentLines.join('\n').trim();
    if (!content) return;
    const heading = [h1, h2, h3].filter(Boolean).join(' > ');
    sections.push({
      pageContent: content,
      metadata: { ...baseMetadata, ...(heading ? { heading } : {}) },
    });
    currentLines = [];
  };

  for (const line of lines) {
    const match = line.match(HEADING);
    if (match) {
      flushSection();
      const level = match[1].length;
      const title = match[2].trim();
      if (level === 1) { h1 = title; h2 = ''; h3 = ''; }
      else if (level === 2) { h2 = title; h3 = ''; }
      else { h3 = title; }
    }
    currentLines.push(line);
  }
  flushSection();

  return sections;
}

// ---------------------------------------------------------------------------
// Core: process a single file from disk path → chunks → Pinecone
// ---------------------------------------------------------------------------
export async function ingestFile(
  filePath: string,
  fileName: string,
  buffer: Buffer
): Promise<{ file: string; status: string; chunks?: number; message?: string }> {
  let docs: any[] = [];

  try {
    if (fileName.endsWith('.pdf')) {
      const loader = new PDFLoader(filePath);
      docs = await loader.load();
    } else if (fileName.endsWith('.docx') || fileName.endsWith('.doc')) {
      const loader = new DocxLoader(filePath);
      docs = await loader.load();
    } else if (fileName.endsWith('.txt') || fileName.endsWith('.md')) {
      const text = buffer.toString('utf-8');
      docs = [{ pageContent: text, metadata: { source: fileName } }];
    } else {
      return { file: fileName, status: 'error', message: 'Unsupported format' };
    }

    docs = docs.map(doc => ({
      ...doc,
      metadata: { ...doc.metadata, source: fileName, uploadedAt: new Date().toISOString() },
    }));

    let chunks: any[];

    if (fileName.endsWith('.md')) {
      const docsWithFrontMatter = docs.map(doc => {
        const { metadata: fmMeta, body } = extractFrontMatter(doc.pageContent);
        return { pageContent: body, metadata: { ...doc.metadata, ...fmMeta } };
      });
      const sections = docsWithFrontMatter.flatMap(doc =>
        splitByHeadings(doc.pageContent, doc.metadata)
      );
      const mdSplitter = new MarkdownTextSplitter({ chunkSize: 2000, chunkOverlap: 200 });
      chunks = await mdSplitter.splitDocuments(sections);
    } else {
      const charSplitter = new RecursiveCharacterTextSplitter({
        chunkSize: 2000,
        chunkOverlap: 200,
        separators: ['\n\n', '\n', '. ', ' ', ''],
      });
      chunks = await charSplitter.splitDocuments(docs);
    }

    const ingestTraceable = traceable(
      async (documents: any[]) => {
        const index = getPineconeIndex();
        const embeddings = getEmbeddings();
        await PineconeStore.fromDocuments(documents, embeddings, { pineconeIndex: index });
        return documents.length;
      },
      { name: 'ingest-documents', metadata: { fileName } }
    );

    const chunksCount = await ingestTraceable(chunks);
    return { file: fileName, status: 'success', chunks: chunksCount };

  } catch (err: any) {
    return { file: fileName, status: 'error', message: err?.message ?? 'Unknown error' };
  }
}

// ---------------------------------------------------------------------------
// Helper: write buffer to a temp file, call ingestFile, then clean up
// ---------------------------------------------------------------------------
export async function ingestBuffer(
  fileName: string,
  buffer: Buffer
): Promise<{ file: string; status: string; chunks?: number; message?: string }> {
  const tempPath = join(tmpdir(), `upload_${Date.now()}_${fileName}`);
  await writeFile(tempPath, buffer);
  try {
    return await ingestFile(tempPath, fileName, buffer);
  } finally {
    await unlink(tempPath).catch(() => {});
  }
}
