// app/api/ingest-source/route.ts
// Reads all supported files from /files/source at the project root,
// runs them through the same LangChain pipeline, and upserts to Pinecone.

import { readdir, readFile } from 'fs/promises';
import { join } from 'path';
import { ingestFile } from '@/lib/ingest';

export const runtime = 'nodejs';
export const maxDuration = 300;

const SUPPORTED = ['.pdf', '.docx', '.doc', '.txt', '.md'];
const SOURCE_DIR = join(process.cwd(), 'files', 'source');

export async function POST() {
  try {
    let entries: string[];
    try {
      entries = await readdir(SOURCE_DIR);
    } catch {
      return Response.json(
        { error: `Source folder not found: ${SOURCE_DIR}` },
        { status: 404 }
      );
    }

    const files = entries.filter(name =>
      SUPPORTED.some(ext => name.toLowerCase().endsWith(ext))
    );

    if (!files.length) {
      return Response.json({ message: 'No supported files found in /files/source.', results: [] });
    }

    const results = [];

    for (const fileName of files) {
      const filePath = join(SOURCE_DIR, fileName);
      const buffer = await readFile(filePath);
      const result = await ingestFile(filePath, fileName, buffer);
      results.push(result);
      console.log(`[ingest-source] ${fileName}: ${result.status} (${result.chunks ?? result.message})`);
    }

    const success = results.filter(r => r.status === 'success');

    return Response.json({
      message: `${success.length}/${files.length} file(s) ingested from /files/source.`,
      results,
      totalChunks: success.reduce((acc, r) => acc + (r.chunks || 0), 0),
    });

  } catch (err) {
    console.error('Error in ingest-source:', err);
    return Response.json({ error: 'Error processing source folder' }, { status: 500 });
  }
}
