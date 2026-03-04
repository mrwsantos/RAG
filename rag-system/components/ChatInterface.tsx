'use client';
// components/ChatInterface.tsx

import { useState, useRef, useEffect } from 'react';

type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: Source[];
  streaming?: boolean;
};

type Source = {
  content: string;
  source: string;
  page?: number;
};

type Provider = 'openai' | 'anthropic';

export default function ChatInterface() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [provider, _] = useState<Provider>('anthropic');
  const [uploadStatus, setUploadStatus] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── Envio de mensagem ──────────────────────────────────────────────────────
  async function sendMessage() {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: Message = { id: crypto.randomUUID(), role: 'user', content: text };
    const assistantId = crypto.randomUUID();
    const assistantMsg: Message = { id: assistantId, role: 'assistant', content: '', streaming: true };

    setMessages(prev => [...prev, userMsg, assistantMsg]);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, provider }),
      });

      if (!res.ok) throw new Error('Erro na API');

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const lines = decoder.decode(value).split('\n');
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const json = JSON.parse(line.slice(6));

          if (json.type === 'token') {
            setMessages(prev =>
              prev.map(m => m.id === assistantId ? { ...m, content: m.content + json.text } : m)
            );
          } else if (json.type === 'sources') {
            setMessages(prev =>
              prev.map(m => m.id === assistantId ? { ...m, sources: json.sources, streaming: false } : m)
            );
          } else if (json.type === 'done') {
            setMessages(prev =>
              prev.map(m => m.id === assistantId ? { ...m, streaming: false } : m)
            );
          } else if (json.type === 'error') {
            setMessages(prev =>
              prev.map(m => m.id === assistantId ? { ...m, content: json.message, streaming: false } : m)
            );
          }
        }
      }
    } catch {
      setMessages(prev =>
        prev.map(m => m.id === assistantId
          ? { ...m, content: 'Error connecting. Please try again.', streaming: false }
          : m
        )
      );
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }

  // ── Upload de documentos ───────────────────────────────────────────────────
  async function uploadFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploadStatus('Uploading...');

    const form = new FormData();
    Array.from(files).forEach(f => form.append('files', f));

    try {
      const res = await fetch('/api/ingest', { method: 'POST', body: form });
      const data = await res.json();
      setUploadStatus(data.message || 'Completed!');
      setTimeout(() => setUploadStatus(''), 4000);
    } catch {
      setUploadStatus('Error uploading files.');
      setTimeout(() => setUploadStatus(''), 4000);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    uploadFiles(e.dataTransfer.files);
  }

  return (
    <div
      style={{ fontFamily: "'IBM Plex Mono', monospace" }}
      className="flex flex-col h-screen bg-[#F5F3F2] text-zinc-100"
      onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
    >
      {/* Header */}
      <header className="border-b border-zinc-800 px-6 py-4 flex items-center justify-center gap-4">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-sm text-centerfont-semibold tracking-widest text-zinc-900 uppercase">
            LINKKI RAG Assistant
          </span>
        </div>

        {/* Provider toggle */}
        {/* <div className="flex items-center gap-1 bg-zinc-900 rounded-lg p-1 border border-zinc-800">
          {(['openai', 'anthropic'] as Provider[]).map(p => (
            <button
              key={p}
              onClick={() => setProvider(p)}
              className={`px-3 py-1 rounded text-xs font-medium transition-all ${
                provider === p
                  ? 'bg-emerald-500 text-zinc-950'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {p === 'openai' ? 'GPT-4o' : 'Claude'}
            </button>
          ))}
        </div> */}

        {/* Upload button */}
        <div className="flex items-center gap-3">
          {uploadStatus && (
            <span className="text-xs text-emerald-400">{uploadStatus}</span>
          )}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 px-3 py-1.5 text-xs border border-zinc-700 rounded-lg text-zinc-700 hover:border-emerald-500 hover:text-emerald-400 transition-all"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            Upload docs
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.docx,.doc,.txt,.md"
            className="hidden"
            onChange={e => uploadFiles(e.target.files)}
          />
        </div>
      </header>

      {/* Drag overlay */}
      {isDragging && (
        <div className="fixed inset-0 z-50 bg-zinc-950/90 flex items-center justify-center border-2 border-dashed border-emerald-500 m-4 rounded-2xl">
          <div className="text-center">
            <div className="text-4xl mb-3">📄</div>
            <p className="text-emerald-400 font-semibold">Drag files here</p>
            <p className="text-zinc-500 text-sm mt-1">MD,PDF, DOCX or TXT</p>
          </div>
        </div>
      )}

      {/* Messages */}
      <main className="flex-1 overflow-y-auto px-4 py-6">
        <div className="max-w-3xl mx-auto space-y-6">
          {messages.length === 0 && (
            <div className="text-center py-20">
              <div className="text-5xl mb-4"><img src="https://linkki.ai/wp-content/uploads/2025/11/Linkki-Brain-Illustration-1-1.gif" alt="LINKKI RAG Assistant" className="w-16 h-16 mx-auto" /></div>
              <h2 className="text-zinc-400 text-lg font-semibold mb-2">
                What can I do for you today?
              </h2>
              {/* <p className="text-zinc-600 text-sm">
                Upload PDFs or DOCXs and start searching.
              </p> */}
              <div className="mt-6 flex flex-wrap gap-2 justify-center w-full">
                {/* {[
                  'What is the vacation policy?',
                  'How does the purchase process work?',
                  'What are the benefits?',
                ].map(q => (
                  <button
                    key={q}
                    onClick={() => { setInput(q); inputRef.current?.focus(); }}
                    className="text-xs px-3 py-1.5 border border-zinc-800 rounded-full text-zinc-500 hover:border-emerald-500 hover:text-emerald-400 transition-all"
                  >
                    {q}
                  </button>
                ))} */}
              </div>
            </div>
          )}

          {messages.map(msg => (
            <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {msg.role === 'assistant' && (
                <div className="w-7 h-7 rounded bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-xs text-emerald-400">AI</span>
                </div>
              )}

              <div className={`max-w-[85%] ${msg.role === 'user' ? 'order-first' : ''}`}>
                <div className={`rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                  msg.role === 'user'
                    ? 'bg-zinc-800 text-zinc-100 rounded-tr-sm'
                    : 'bg-zinc-900 border border-zinc-800 text-zinc-200 rounded-tl-sm'
                }`}>
                  {msg.content}
                  {msg.streaming && (
                    <span className="inline-block w-1.5 h-4 bg-emerald-400 ml-0.5 animate-pulse" />
                  )}
                </div>

                {/* Sources */}
                {msg.sources && msg.sources.length > 0 && (
                  <div className="mt-2 space-y-1">
                    <p className="text-xs text-zinc-600 uppercase tracking-widest">Sources</p>
                    {msg.sources.map((src, i) => (
                      <div key={i} className="text-xs bg-white border border-zinc-200 rounded-lg px-3 py-2">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-emerald-500">📄</span>
                          <span className="text-zinc-400 font-medium">{src.source}</span>
                          {src.page && <span className="text-zinc-600">page{src.page}</span>}
                        </div>
                        <p className="text-zinc-600 line-clamp-2">{src.content}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {msg.role === 'user' && (
                <div className="w-7 h-7 rounded bg-zinc-800 border border-zinc-700 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-xs text-zinc-400">You</span>
                </div>
              )}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      </main>

      {/* Input */}
      <footer className="border-t border-zinc-300 px-4 py-4">
        <div className="max-w-3xl mx-auto flex gap-3 items-end">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask me anything..."
            rows={1}
            disabled={loading}
            className="flex-1 bg-white  rounded-xl px-4 py-3 text-sm text-zinc-800 placeholder-zinc-600 resize-none focus:outline-none focus:border-emerald-500 transition-colors disabled:opacity-50"
            style={{ maxHeight: '120px', overflowY: 'auto' }}
            onInput={e => {
              const t = e.target as HTMLTextAreaElement;
              t.style.height = 'auto';
              t.style.height = Math.min(t.scrollHeight, 120) + 'px';
            }}
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || loading}
            className="w-10 h-10 bg-[#CFF5D3] hover:bg-emerald-400 disabled:opacity-30 disabled:cursor-not-allowed rounded-xl flex items-center justify-center transition-all flex-shrink-0"
          >
            {loading ? (
              <div className="w-4 h-4 border-2 border-zinc-950 border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg className="w-4 h-4 text-zinc-950" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            )}
          </button>
        </div>
        <p className="text-center text-zinc-700 text-xs mt-2">
          Responses generated from internal documents · Monitored via LangSmith
        </p>
      </footer>
    </div>
  );
}