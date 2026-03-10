// app/api/export/route.ts
import { getPineconeIndex } from '@/lib/pinecone';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET() {
  try {
    const index = getPineconeIndex();

    // Pinecone requires a query to fetch vectors — we use a zero vector to list all
    const dimension = 1536; // OpenAI text-embedding-3-small / ada-002 dimension
    const zeroVector = new Array(dimension).fill(0);

    const allChunks: any[] = [];
    let cursor: string | undefined = undefined;
    const batchSize = 100;

    // Paginate through all vectors using topK batches
    do {
      const response = await index.query({
        vector: zeroVector,
        topK: batchSize,
        includeMetadata: true,
        ...(cursor ? { filter: { _id: { $gt: cursor } } } : {}),
      });

      const matches = response.matches ?? [];
      if (matches.length === 0) break;

      for (const match of matches) {
        allChunks.push({
          id: match.id,
          score: match.score,
          source: match.metadata?.source ?? 'unknown',
          heading: match.metadata?.heading ?? '',
          uploadedAt: match.metadata?.uploadedAt ?? '',
          topic_tags: match.metadata?.topic_tags ?? '',
          jurisdiction: match.metadata?.jurisdiction ?? '',
          priority_score: match.metadata?.priority_score ?? '',
          text: match.metadata?.text ?? match.metadata?.pageContent ?? '',
        });
      }

      // If we got fewer than batchSize, we've reached the end
      if (matches.length < batchSize) break;
      cursor = matches[matches.length - 1].id;
    } while (true);

    // Build JSON Lines format — one chunk per line, easy to parse
    const jsonl = allChunks.map(c => JSON.stringify(c)).join('\n');

    const filename = `pinecone-chunks-${new Date().toISOString().slice(0, 10)}.jsonl`;

    return new Response(jsonl, {
      headers: {
        'Content-Type': 'application/x-ndjson',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    console.error('Export error:', err);
    return Response.json({ error: 'Failed to export chunks' }, { status: 500 });
  }
}
