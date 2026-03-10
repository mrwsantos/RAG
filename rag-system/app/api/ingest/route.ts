// app/api/ingest/route.ts
import { NextRequest } from 'next/server';
import { ingestBuffer } from '@/lib/ingest';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const files = formData.getAll('files') as File[];

    if (!files.length) {
      return Response.json({ error: 'No files uploaded' }, { status: 400 });
    }

    const results = await Promise.all(
      files.map(async file => {
        const buffer = Buffer.from(await file.arrayBuffer());
        return ingestBuffer(file.name, buffer);
      })
    );

    const success = results.filter(r => r.status === 'success');

    return Response.json({
      message: `${success.length} file(s) processed successfully.`,
      results,
      totalChunks: success.reduce((acc, r) => acc + (r.chunks || 0), 0),
    });

  } catch (err) {
    console.error('Error during ingestion:', err);
    return Response.json({ error: 'Error processing documents' }, { status: 500 });
  }
}
