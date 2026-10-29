"use client";

import { useEffect, useRef, useState } from "react";
import type { ChatMessage } from "@/lib/types";

const STORAGE_KEY = "lamig-chat";
const GREETING =
  "Hi! I'm the Lamig receptionist. I can answer questions about our aircon cleaning, check free times and book for you. What can I help with?";

type Stored = { sessionId: string; messages: ChatMessage[] };

function newSession(): Stored {
  return { sessionId: crypto.randomUUID(), messages: [] };
}

function load(): Stored {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Stored;
      if (parsed.sessionId && Array.isArray(parsed.messages)) return parsed;
    }
  } catch {
    // Private mode or blocked storage: the chat still works for this visit.
  }
  return newSession();
}

function save(data: Stored) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...data, messages: data.messages.slice(-40) }));
  } catch {
    // Ignore: storage is only a convenience.
  }
}

// Floating chat with the AI receptionist (the n8n Receptionist workflow).
export function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [chat, setChat] = useState<Stored | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const messages = chat?.messages ?? [];

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages.length, sending, open]);

  function openChat() {
    if (!chat) setChat(load());
    setOpen(true);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function closeChat() {
    setOpen(false);
    buttonRef.current?.focus();
  }

  function startOver() {
    const fresh = newSession();
    setChat(fresh);
    save(fresh);
    setError("");
    inputRef.current?.focus();
  }

  async function send() {
    const text = draft.trim();
    if (!text || sending || !chat) return;

    const withUser: Stored = { ...chat, messages: [...chat.messages, { role: "user", content: text }] };
    setChat(withUser);
    save(withUser);
    setDraft("");
    setError("");
    setSending(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId: chat.sessionId, message: text }),
      });
      const data = (await res.json()) as { reply?: string; error?: string };
      if (!res.ok || !data.reply) throw new Error(data.error || "No reply");

      const withReply: Stored = { ...withUser, messages: [...withUser.messages, { role: "assistant", content: data.reply }] };
      setChat(withReply);
      save(withReply);
    } catch (err) {
      setError(
        err instanceof Error && err.message !== "No reply" && err.message !== "Failed to fetch"
          ? err.message
          : "The receptionist did not answer. Check your connection and send again.",
      );
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }

  return (
    <>
      {!open && (
        <button
          ref={buttonRef}
          type="button"
          onClick={openChat}
          className="btn btn-ink fixed right-4 bottom-4 z-40 py-3.5 shadow-[0_12px_30px_-10px_rgba(10,37,48,0.8)] sm:right-6 sm:bottom-6"
        >
          <svg aria-hidden width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 5h16v11H9l-5 4z" strokeLinejoin="round" />
          </svg>
          Ask the receptionist
        </button>
      )}

      {open && (
        <div
          role="dialog"
          aria-modal="false"
          aria-labelledby="chat-title"
          onKeyDown={(e) => e.key === "Escape" && closeChat()}
          className="fixed inset-x-0 bottom-0 z-50 flex h-[min(640px,100dvh)] flex-col overflow-hidden bg-frost shadow-[0_20px_60px_-15px_rgba(10,37,48,0.6)] sm:inset-x-auto sm:right-6 sm:bottom-6 sm:w-[400px] sm:rounded-3xl sm:border sm:border-mist"
        >
          <div className="flex items-center justify-between gap-3 bg-ink px-5 py-4 text-frost">
            <div>
              <h2 id="chat-title" className="text-lg font-bold" style={{ fontStretch: "100%" }}>
                Lamig receptionist
              </h2>
              <p className="text-sm text-mist">AI assistant. It can check times and book for you.</p>
            </div>
            <button type="button" onClick={closeChat} className="rounded-full p-2 hover:bg-white/10" aria-label="Close chat">
              <svg aria-hidden width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>

          <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4" aria-live="polite">
            <Bubble role="assistant" content={GREETING} />
            {messages.map((m, i) => (
              <Bubble key={i} role={m.role} content={m.content} />
            ))}
            {sending && (
              <p className="text-sm text-steel" role="status">
                Receptionist is typing…
              </p>
            )}
            {error && (
              <p className="rounded-xl border border-bad/30 bg-white px-3 py-2 text-sm text-bad" role="alert">
                {error}
              </p>
            )}
          </div>

          <form
            className="border-t border-mist bg-white p-3"
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
          >
            <label htmlFor="chat-input" className="sr-only">
              Message
            </label>
            <div className="flex items-end gap-2">
              <textarea
                id="chat-input"
                ref={inputRef}
                rows={1}
                maxLength={1000}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                placeholder="Type a message"
                className="field max-h-32 min-h-11 resize-none"
              />
              <button type="submit" className="btn btn-sun shrink-0 px-4" disabled={sending || !draft.trim()}>
                Send
              </button>
            </div>
            {messages.length > 0 && (
              <button type="button" onClick={startOver} className="mt-2 text-sm text-steel underline underline-offset-2">
                Start a new chat
              </button>
            )}
          </form>
        </div>
      )}
    </>
  );
}

function Bubble({ role, content }: ChatMessage) {
  const mine = role === "user";
  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <p
        className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 whitespace-pre-line ${
          mine ? "rounded-br-md bg-ink text-frost" : "rounded-bl-md border border-mist bg-white text-ink"
        }`}
      >
        <span className="sr-only">{mine ? "You: " : "Receptionist: "}</span>
        {content}
      </p>
    </div>
  );
}
