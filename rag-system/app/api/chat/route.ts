// app/api/chat/route.ts
import { NextRequest } from 'next/server';
import { buildRAGChain } from '@/lib/langchain';
import { traceable } from 'langsmith/traceable';
import { wrapOpenAI } from 'langsmith/wrappers';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const { message, provider = 'anthropic', history = [] } = await req.json();

    if (!message) {
      return Response.json({ error: 'Message is required' }, { status: 400 });
    }

    // Stream response
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Função traceable para LangSmith monitorar
          const tracedRAG = traceable(
            async (input: string) => {
              const chain = await buildRAGChain(provider as 'openai' | 'anthropic');
              return chain.streamEvents({ input }, { version: 'v2' });
            },
            {
              name: 'rag-chat',
              metadata: {
                provider,
                messageLength: message.length,
                historyLength: history.length,
              },
            }
          );

          const eventStream = await tracedRAG(message);

          let sourceDocs: any[] = [];

          for await (const event of eventStream) {
            // Captura os documentos fonte
            if (event.event === 'on_retriever_end') {
              sourceDocs = event.data?.output ?? [];
            }

            // Streama os tokens de texto
            if (
              event.event === 'on_chat_model_stream' &&
              event.data?.chunk?.content
            ) {
              const text = event.data.chunk.content;
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ type: 'token', text })}\n\n`)
              );
            }
          }

          // Envia os documentos fonte ao final
          const sources = sourceDocs.map((doc: any) => ({
            content: doc.pageContent?.slice(0, 200) + '...',
            source: doc.metadata?.source || 'Internal document',
            page: doc.metadata?.page,
          }));

          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: 'sources', sources })}\n\n`
            )
          );

          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`)
          );
        } catch (err) {
          console.error('Erro no RAG:', err);
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: 'error', message: 'Error processing your question.' })}\n\n`
            )
          );
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (err) {
    console.error('Erro na API:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}