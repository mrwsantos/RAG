"use client";
// components/ChatInterface.tsx

import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
  streaming?: boolean;
};

type Source = {
  content: string;
  source: string;
  page?: number;
};

type Provider = "openai" | "anthropic";

export default function ChatInterface() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [provider, setProvider] = useState<Provider>("anthropic");
  const [uploadStatus, setUploadStatus] = useState("");
  const [exporting, setExporting] = useState(false);
  const [ingestingSource, setIngestingSource] = useState(false);
  // const [isDragging, setIsDragging] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    console.log("Selected provider:", provider);
  }, [provider]);

  // ── Envio de mensagem ──────────────────────────────────────────────────────
  async function sendMessage() {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
    };
    const assistantId = crypto.randomUUID();
    const assistantMsg: Message = {
      id: assistantId,
      role: "assistant",
      content: "",
      streaming: true,
    };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, provider }),
      });

      if (!res.ok) throw new Error("API Error");

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const lines = decoder.decode(value).split("\n");
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const json = JSON.parse(line.slice(6));

          if (json.type === "token") {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? { ...m, content: m.content + json.text }
                  : m,
              ),
            );
          } else if (json.type === "sources") {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? { ...m, sources: json.sources, streaming: false }
                  : m,
              ),
            );
          } else if (json.type === "done") {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, streaming: false } : m,
              ),
            );
          } else if (json.type === "error") {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? { ...m, content: json.message, streaming: false }
                  : m,
              ),
            );
          }
        }
      }
    } catch {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? {
                ...m,
                content: "Error connecting. Please try again.",
                streaming: false,
              }
            : m,
        ),
      );
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }

  // ── Upload de documentos ───────────────────────────────────────────────────
  async function uploadFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploadStatus("Uploading...");

    const form = new FormData();
    Array.from(files).forEach((f) => form.append("files", f));

    try {
      const res = await fetch("/api/ingest", { method: "POST", body: form });
      const data = await res.json();
      setUploadStatus(data.message || "Completed!");
      setTimeout(() => setUploadStatus(""), 4000);
    } catch {
      setUploadStatus("Error uploading files.");
      setTimeout(() => setUploadStatus(""), 4000);
    }
  }

  async function ingestSource() {
    setIngestingSource(true);
    setUploadStatus("Ingesting /files/source...");
    try {
      const res = await fetch("/api/ingest-source", { method: "POST" });
      const data = await res.json();
      setUploadStatus(data.message || "Done!");
      setTimeout(() => setUploadStatus(""), 5000);
    } catch {
      setUploadStatus("Error ingesting source folder.");
      setTimeout(() => setUploadStatus(""), 5000);
    } finally {
      setIngestingSource(false);
    }
  }

  async function exportChunks() {
    setExporting(true);
    try {
      const res = await fetch("/api/export");
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `pinecone-chunks-${new Date().toISOString().slice(0, 10)}.jsonl`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert("Error exporting chunks from Pinecone.");
    } finally {
      setExporting(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  // function handleDrop(e: React.DragEvent) {
  //   e.preventDefault();
  //   setIsDragging(false);
  //   uploadFiles(e.dataTransfer.files);
  // }

  return (
    <div className="flex flex-col gap-20 w-full max-w-[700px]">
      {/* Provider toggle */}
      {process.env.NEXT_PUBLIC_APP_ENVIRONMENT === "development" && (
        <div className="flex items-center justify-center gap-10 w-full mb-10">
          <div className="flex items-center gap-1 bg-[#273D4F] rounded-lg  h-10 px-2 border mr-30">
            {(["openai", "anthropic"] as Provider[]).map((p) => (
              <button
                key={p}
                onClick={() => setProvider(p)}
                className={`px-3 py-1 rounded text-xs font-medium transition-all cursor-pointer ${
                  provider === p
                    ? "bg-[#CFF5D3] text-zinc-950"
                    : "text-white hover:text-[#cff5d3]"
                }`}
              >
                {p === "openai" ? "ChatGPT" : "Claude"}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3">
            {uploadStatus && (
              <span className="text-xs text-emerald-400">{uploadStatus}</span>
            )}
            {/* <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 h-10 px-3 text-xs bg-white rounded-lg text-zinc-700 hover:border-emerald-500 hover:text-emerald-400 transition-all cursor-pointer"
              >
                <svg
                  className="w-3.5 h-3.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                  />
                </svg>
                Upload docs
              </button> */}
            <button
              onClick={ingestSource}
              disabled={ingestingSource}
              title="Ingest all files from /files/source"
              className="flex items-center gap-2 h-10 px-3 text-xs bg-white rounded-lg text-zinc-700 hover:text-emerald-400 transition-all cursor-pointer disabled:opacity-50"
            >
              {ingestingSource ? (
                <div className="w-3.5 h-3.5 border-2 border-zinc-400 border-t-transparent rounded-full animate-spin" />
              ) : (
                <svg
                  className="w-3.5 h-3.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 7v10c0 2 1 3 3 3h10c2 0 3-1 3-3V7M9 5h6M12 2v10m-3-3l3 3 3-3"
                  />
                </svg>
              )}
              Sync /source
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.docx,.doc,.txt,.md"
              className="hidden"
              onChange={(e) => uploadFiles(e.target.files)}
            />
            <button
              onClick={exportChunks}
              disabled={exporting}
              title="Export Pinecone chunks"
              className="flex items-center gap-2 h-10 px-3 text-xs bg-white rounded-lg text-zinc-700 hover:text-emerald-400 transition-all cursor-pointer disabled:opacity-50"
            >
              {exporting ? (
                <div className="w-3.5 h-3.5 border-2 border-zinc-400 border-t-transparent rounded-full animate-spin" />
              ) : (
                <svg
                  className="w-3.5 h-3.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                  />
                </svg>
              )}
              Chunks
            </button>
            <button
              onClick={async () => {
                if (!confirm("Clear ALL Pinecone vectors and reset manifest?"))
                  return;
                const res = await fetch("/api/admin/clear-index", {
                  method: "POST",
                });
                const data = await res.json();
                setUploadStatus(data.message || data.error || "Done");
                setTimeout(() => setUploadStatus(""), 4000);
              }}
              title="Clear Pinecone index + reset manifest"
              className="flex items-center gap-2 h-10 px-3 text-xs bg-red-900/60 rounded-lg text-red-300 hover:text-red-100 transition-all cursor-pointer"
            >
              <svg
                className="w-3.5 h-3.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
              Clear index
            </button>
          </div>
        </div>
      )}
      <div
        style={{ fontFamily: "'IBM Plex Mono', monospace" }}
        className="flex flex-col  bg-[#F5F3F2] text-zinc-100 w-full max-w-[700px] mx-auto rounded-2xl"
        // onDragOver={(e) => {
        //   e.preventDefault();
        //   setIsDragging(true);
        // }}
        // onDragLeave={() => setIsDragging(false)}
        // onDrop={handleDrop}
      >
        {/* ACTIONS */}

        {/* Header */}
        <header className="border-b border-zinc-300 px-6 py-4 flex items-center justify-center gap-4">
          <div className="flex items-center gap-3">
            {/* <div className="w-4 h-4 rounded-full bg-emerald-400 animate-pulse" /> */}
            <img
              src="https://linkki.ai/wp-content/uploads/2025/11/Linkki-Brain-Illustration-1-1.gif"
              alt="LINKKI RAG Assistant"
              className="w-16 h-16 mx-auto"
            />
            <span className="text-lg text-centerfont-semibold tracking-widest text-[#273D4F] uppercase font-bold">
              LINKKI RAG
            </span>
          </div>

          {/* Provider toggle */}
          {/* {process.env.NEXT_PUBLIC_APP_ENVIRONMENT === "development" && (
          <>
            <div className="flex items-center gap-1 bg-[#273D4F] rounded-lg  h-10 px-2 border ml-auto">
              {(["openai", "anthropic"] as Provider[]).map((p) => (
                <button
                  key={p}
                  onClick={() => setProvider(p)}
                  className={`px-3 py-1 rounded text-xs font-medium transition-all cursor-pointer ${
                    provider === p
                      ? "bg-[#CFF5D3] text-zinc-950"
                      : "text-white hover:text-[#cff5d3]"
                  }`}
                >
                  {p === "openai" ? "ChatGPT" : "Claude"}
                </button>
              ))}
            </div>          
          </>
        )} */}
        </header>

        {/* Drag overlay */}
        {/* {isDragging && (
        <div className="fixed inset-0 z-50 bg-zinc-950/90 flex items-center justify-center border-2 border-dashed border-emerald-500 m-4 rounded-2xl">
          <div className="text-center">
            <div className="text-4xl mb-3">📄</div>
            <p className="text-emerald-400 font-semibold">Drag files here</p>
            <p className="text-zinc-500 text-sm mt-1">MD,PDF, DOCX or TXT</p>
          </div>
        </div>
      )} */}

        {/* Messages */}
        <main className="flex-1 overflow-y-auto px-4 py-6 min-h-[70vh] max-h-[70vh] overflow-auto">
          <div className="max-w-3xl mx-auto space-y-6">
            {messages.length === 0 && (
              <div className="text-center py-20">
                <h2 className="text-[#273D4F] text-lg font-semibold mb-2">
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

            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                {msg.role === "assistant" && (
                  <div className="w-7 h-7 rounded bg-[#cff5d3] text-[#273D4F] flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-xs">AI</span>
                  </div>
                )}

                <div
                  className={`max-w-[85%] ${msg.role === "user" ? "order-first" : ""}`}
                >
                  <div
                    className={`rounded-2xl  text-sm leading-relaxed ${
                      msg.role === "user"
                        ? "bg-[#273D4F] text-[#CFF5D3] rounded-tr-sm whitespace-pre-wrap px-4 py-3"
                        : " text-zinc-800 rounded-tl-sm p-0"
                    }`}
                  >
                    {msg.role === "user" ? (
                      msg.content
                    ) : (
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          p: ({ children }) => (
                            <p className="mb-2 last:mb-0">{children}</p>
                          ),
                          strong: ({ children }) => (
                            <strong className="font-semibold text-zinc-900">
                              {children}
                            </strong>
                          ),
                          em: ({ children }) => (
                            <em className="italic text-zinc-600">{children}</em>
                          ),
                          h1: ({ children }) => (
                            <h1 className="text-base font-bold text-zinc-900 mb-2 mt-3 first:mt-0">
                              {children}
                            </h1>
                          ),
                          h2: ({ children }) => (
                            <h2 className="text-sm font-bold text-zinc-900 mb-2 mt-3 first:mt-0">
                              {children}
                            </h2>
                          ),
                          h3: ({ children }) => (
                            <h3 className="text-sm font-semibold text-zinc-800 mb-1 mt-2 first:mt-0">
                              {children}
                            </h3>
                          ),
                          ul: ({ children }) => (
                            <ul className="list-disc list-inside space-y-1 mb-2 pl-2">
                              {children}
                            </ul>
                          ),
                          ol: ({ children }) => (
                            <ol className="list-decimal list-inside space-y-1 mb-2 pl-2">
                              {children}
                            </ol>
                          ),
                          li: ({ children }) => (
                            <li className="text-zinc-700">{children}</li>
                          ),
                          // eslint-disable-next-line @typescript-eslint/no-explicit-any
                          code: ({ inline, children }: any) =>
                            inline ? (
                              <code className="bg-zinc-100 text-emerald-700 px-1 py-0.5 rounded text-xs font-mono">
                                {children}
                              </code>
                            ) : (
                              <code className="block bg-zinc-100 text-emerald-700 px-3 py-2 rounded-lg text-xs font-mono my-2 overflow-x-auto whitespace-pre">
                                {children}
                              </code>
                            ),
                          pre: ({ children }) => <>{children}</>,
                          blockquote: ({ children }) => (
                            <blockquote className="border-l-2 border-emerald-500 pl-3 text-zinc-500 italic my-2">
                              {children}
                            </blockquote>
                          ),
                          a: ({ href, children }) => (
                            <a
                              href={href}
                              className="text-emerald-600 underline hover:text-emerald-500"
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              {children}
                            </a>
                          ),
                          hr: () => <hr className="border-zinc-200 my-3" />,
                        }}
                      >
                        {msg.content}
                      </ReactMarkdown>
                    )}
                    {msg.streaming && (
                      <span className="inline-block w-1.5 h-4 bg-emerald-400 ml-0.5 animate-pulse" />
                    )}
                  </div>

                  {/* Sources */}
                  {/* {msg.sources && msg.sources.length > 0 && (
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
                )} */}
                </div>

                {msg.role === "user" && (
                  <div className="w-9 h-7 rounded bg-[#273D4F] text-[#CFF5D3] flex items-center justify-center uppercase flex-shrink-0 mt-0.5">
                    <span className="text-xs ">You</span>
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
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask me anything..."
              rows={1}
              disabled={loading}
              className="flex-1 bg-white  rounded-xl px-4 py-3 text-sm text-zinc-800 placeholder-zinc-600 resize-none focus:outline-none focus:border-emerald-500 transition-colors disabled:opacity-50"
              style={{ maxHeight: "120px", overflowY: "auto" }}
              onInput={(e) => {
                const t = e.target as HTMLTextAreaElement;
                t.style.height = "auto";
                t.style.height = Math.min(t.scrollHeight, 120) + "px";
              }}
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim() || loading}
              className="w-10 h-10 bg-[#CFF5D3] text-[#273D4F] hover:bg-[#273D4F] hover:text-white disabled:opacity-30 disabled:cursor-not-allowed rounded-xl flex items-center justify-center transition-all flex-shrink-0 cursor-pointer"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-zinc-950 border-t-transparent rounded-full animate-spin" />
              ) : (
                <svg
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2.5}
                    d="M5 12h14M12 5l7 7-7 7"
                  />
                </svg>
              )}
            </button>
          </div>
          <p className="text-center text-zinc-700 text-xs mt-2">
            Responses generated from internal documents
          </p>
        </footer>
      </div>
    </div>
  );
}
