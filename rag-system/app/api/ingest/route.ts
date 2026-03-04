// app/api/ingest/route.ts
import { NextRequest } from 'next/server';
import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf';
import { DocxLoader } from '@langchain/community/document_loaders/fs/docx';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { PineconeStore } from '@langchain/pinecone';
import { getEmbeddings } from '@/lib/langchain';
import { getPineconeIndex } from '@/lib/pinecone';
import { traceable } from 'langsmith/traceable';
import { writeFile, unlink } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const files = formData.getAll('files') as File[];

    if (!files.length) {
      return Response.json({ error: 'Nenhum arquivo enviado' }, { status: 400 });
    }

    const results = [];

    for (const file of files) {
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);

      // Salva temp para o loader
      const tempPath = join(tmpdir(), `upload_${Date.now()}_${file.name}`);
      await writeFile(tempPath, buffer);

      try {
        // Carrega o documento conforme tipo
        let docs: any[] = [];
        if (file.name.endsWith('.pdf')) {
          const loader = new PDFLoader(tempPath);
          docs = await loader.load();
        } else if (file.name.endsWith('.docx') || file.name.endsWith('.doc')) {
          const loader = new DocxLoader(tempPath);
          docs = await loader.load();
        } else if (file.name.endsWith('.txt') || file.name.endsWith('.md')) {
          const text = buffer.toString('utf-8');
          docs = [{ pageContent: text, metadata: { source: file.name } }];
        } else {
          results.push({ file: file.name, status: 'erro', message: 'Formato não suportado (use PDF, DOCX, TXT)' });
          continue;
        }

        // Adiciona metadados de fonte
        docs = docs.map(doc => ({
          ...doc,
          metadata: { ...doc.metadata, source: file.name, uploadedAt: new Date().toISOString() },
        }));

        // Chunking
        const splitter = new RecursiveCharacterTextSplitter({
          chunkSize: 1000,       // ~750 tokens por chunk
          chunkOverlap: 200,     // overlap para não perder contexto
          separators: ['\n\n', '\n', '. ', ' ', ''],
        });
        const chunks = await splitter.splitDocuments(docs);

        // Salva no Pinecone (traceable para LangSmith)
        const ingestTraceable = traceable(
          async (documents: any[]) => {
            const index = getPineconeIndex();
            const embeddings = getEmbeddings();
            await PineconeStore.fromDocuments(documents, embeddings, {
              pineconeIndex: index,
            });
            return documents.length;
          },
          { name: 'ingest-documents', metadata: { fileName: file.name } }
        );

        const chunksCount = await ingestTraceable(chunks);
        results.push({ file: file.name, status: 'ok', chunks: chunksCount });

      } finally {
        // Limpa o arquivo temp
        await unlink(tempPath).catch(() => {});
      }
    }

    const errors = results.filter(r => r.status === 'erro');
    const success = results.filter(r => r.status === 'ok');

    return Response.json({
      message: `${success.length} arquivo(s) processado(s) com sucesso.`,
      results,
      totalChunks: success.reduce((acc, r) => acc + (r.chunks || 0), 0),
    });

  } catch (err) {
    console.error('Erro na ingestão:', err);
    return Response.json({ error: 'Erro ao processar documentos' }, { status: 500 });
  }
}