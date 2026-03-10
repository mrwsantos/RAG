// app/api/ingest-source/route.ts
// Reads all supported files from /files/source at the project root,
// runs them through the same LangChain pipeline, and upserts to Pinecone.
// Files whose content hasn't changed since last ingest are skipped.

import { readdir, readFile } from 'fs/promises';
import { join } from 'path';
import { ingestFile, hashBuffer, readManifest } from '@/lib/ingest';

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

    const manifest = await readManifest();
    const results = [];

    for (const fileName of files) {
      const filePath = join(SOURCE_DIR, fileName);
      const buffer = await readFile(filePath);
      const currentHash = hashBuffer(buffer);

      // Skip if content is identical to last ingest
      if (manifest[fileName]?.hash === currentHash) {
        results.push({ file: fileName, status: 'skipped', chunks: manifest[fileName].chunks });
        console.log(`[ingest-source] ${fileName}: skipped (unchanged)`);
        continue;
      }

      const result = await ingestFile(filePath, fileName, buffer);
      results.push(result);
      console.log(`[ingest-source] ${fileName}: ${result.status} (${result.chunks ?? result.message})`);
    }

    const success = results.filter(r => r.status === 'success');
    const skipped = results.filter(r => r.status === 'skipped');

    return Response.json({
      message: `${success.length} ingested, ${skipped.length} unchanged, ${results.filter(r => r.status === 'error').length} errors.`,
      results,
      totalChunks: success.reduce((acc, r) => acc + (r.chunks || 0), 0),
    });

  } catch (err) {
    console.error('Error in ingest-source:', err);
    return Response.json({ error: 'Error processing source folder' }, { status: 500 });
  }
}
