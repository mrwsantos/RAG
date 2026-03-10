// app/api/admin/clear-index/route.ts
// ONE-TIME USE: deletes all vectors from Pinecone and resets the manifest.
// Only available in development.

import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { getPineconeIndex } from '@/lib/pinecone';

export const runtime = 'nodejs';

export async function POST() {
  if (process.env.NEXT_PUBLIC_APP_ENVIRONMENT !== 'development') {
    return Response.json({ error: 'Not available in production' }, { status: 403 });
  }

  try {
    const index = getPineconeIndex();
    await index.deleteAll();

    // Reset manifest
    const manifestPath = join(process.cwd(), 'files', '.manifest.json');
    await mkdir(join(process.cwd(), 'files'), { recursive: true });
    await writeFile(manifestPath, '{}', 'utf-8');

    return Response.json({ message: 'Pinecone index cleared and manifest reset.' });
  } catch (err: any) {
    return Response.json({ error: err?.message ?? 'Failed to clear index' }, { status: 500 });
  }
}
