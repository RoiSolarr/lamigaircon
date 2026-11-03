"use client";

import { useEffect, useRef, useState } from "react";
import type { ChatMessage } from "@/lib/types";

const STORAGE_KEY = "lamig-chat";
const GREETING =
  "Hi! I'm the Lamig receptionist. I can answer questions about our aircon cleaning, check free times and book for you. What can I help with?";

// paused: staff have taken over this chat, so the AI does not answer.
// lastStaffId / seenStaffId: newest staff reply received / seen (for the "new reply" dot).
type Stored = {
  sessionId: string;
  messages: ChatMessage[];
  paused?: boolean;
  lastStaffId?: number;
  seenStaffId?: number;
};

type StaffPoll = { paused?: boolean; messages?: { id: number; content: string }[] };
type History = { conversation_id: string | null; paused?: boolean; messages?: { id: number; role: ChatMessage["role"]; content: string }[] };

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

const OPEN_EVENT = "lamig:open-chat";

// A button anywhere on the page that opens the chat ("Ask the receptionist").
export function OpenChatButton({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <button type="button" className={className} onClick={() => window.dispatchEvent(new Event(OPEN_EVENT))}>
      {children}
    </button>
  );
}

// Clears the saved chat, for example when a customer signs out on a shared computer.
export function clearSavedChat() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore.
  }
}

// Floating chat with the AI receptionist (the n8n Receptionist workflow).
// Staff can also reply from the admin Inbox; those replies are fetched every
// few seconds while the chat is open (every 30 seconds while it is closed).
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
  const sessionId = chat?.sessionId;
  const hasChat = messages.length > 0;
  const unread = !open && (chat?.lastStaffId ?? 0) > (chat?.seenStaffId ?? 0);

  // Load the saved chat after the page loads, so staff replies can arrive while it is closed.
  useEffect(() => {
    const timer = setTimeout(() => setChat((current) => current ?? load()), 0);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages.length, sending, open]);

  // Check for staff replies.
  useEffect(() => {
    if (!sessionId || !hasChat) return;
    let stopped = false;

    const check = async () => {
      try {
        const res = await fetch(`/api/chat/messages?sessionId=${encodeURIComponent(sessionId)}&after=0`, { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as StaffPoll;
        if (stopped) return;
        const fresh = data.messages ?? [];
        setChat((prev) => {
          if (!prev || prev.sessionId !== sessionId) return prev;
          const known = new Set(prev.messages.map((m) => m.id).filter(Boolean));
          const added = fresh
            .filter((m) => !known.has(m.id))
            .map((m) => ({ role: "staff" as const, content: m.content, id: m.id }));
          const paused = Boolean(data.paused);
          if (added.length === 0 && paused === Boolean(prev.paused)) return prev;
          const next: Stored = {
            ...prev,
            paused,
            messages: [...prev.messages, ...added],
            lastStaffId: Math.max(prev.lastStaffId ?? 0, ...fresh.map((m) => m.id)),
          };
          save(next);
          return next;
        });
      } catch {
        // Offline for a moment: try again on the next check.
      }
    };

    check();
    const timer = setInterval(check, open ? 8000 : 30000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [sessionId, hasChat, open]);

  function markSeen(current: Stored) {
    if ((current.seenStaffId ?? 0) === (current.lastStaffId ?? 0)) return current;
    const next = { ...current, seenStaffId: current.lastStaffId };
    save(next);
    return next;
  }

  async function openChat() {
    const current = chat ?? load();
    setChat(markSeen(current));
    setOpen(true);
    requestAnimationFrame(() => inputRef.current?.focus());

    // Signed in customers continue their latest chat, even from another device.
    if (current.messages.length === 0) {
      try {
        const res = await fetch("/api/chat/history", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as History;
        if (!data.conversation_id || !data.messages?.length) return;
        const staffIds = data.messages.filter((m) => m.role === "staff").map((m) => m.id);
        const restored: Stored = {
          sessionId: data.conversation_id,
          paused: Boolean(data.paused),
          messages: data.messages.map((m) => ({ role: m.role, content: m.content, id: m.id })),
          lastStaffId: Math.max(0, ...staffIds),
          seenStaffId: Math.max(0, ...staffIds),
        };
        setChat((prev) => (prev && prev.messages.length > 0 ? prev : restored));
        save(restored);
      } catch {
        // Not signed in or offline: start a new chat as usual.
      }
    }
  }

  // Open when an OpenChatButton is pressed.
  const openRef = useRef(openChat);
  useEffect(() => {
    openRef.current = openChat;
  });
  useEffect(() => {
    const open = () => openRef.current();
    window.addEventListener(OPEN_EVENT, open);
    return () => window.removeEventListener(OPEN_EVENT, open);
  }, []);

  function closeChat() {
    if (chat) setChat(markSeen(chat));
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
      const data = (await res.json()) as { reply?: string; waiting?: boolean; error?: string };

      // Staff are answering this chat: the message is saved, their reply arrives by polling.
      if (res.ok && data.waiting) {
        const waiting: Stored = { ...withUser, paused: true };
        setChat(waiting);
        save(waiting);
        return;
      }
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
          className="btn btn-ink fixed right-4 bottom-4 z-40 py-2.5 pr-5 pl-2.5 shadow-[0_16px_36px_-12px_rgba(10,37,48,0.85)] ring-1 ring-white/10 sm:right-6 sm:bottom-6"
        >
          <span aria-hidden className="relative grid h-9 w-9 place-items-center rounded-full bg-sun text-deep">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M4 5h16v11H9l-5 4z" strokeLinejoin="round" />
            </svg>
            <span className="absolute -right-0.5 -bottom-0.5 h-3 w-3 rounded-full bg-ok ring-2 ring-ink" />
          </span>
          {unread ? "New reply from our staff" : "Ask the receptionist"}
          {unread && <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-sun" />}
        </button>
      )}

      {open && (
        <div
          role="dialog"
          aria-modal="false"
          aria-labelledby="chat-title"
          onKeyDown={(e) => e.key === "Escape" && closeChat()}
          className="animate-rise fixed inset-x-0 bottom-0 z-50 flex h-[min(660px,100dvh)] flex-col overflow-hidden bg-frost shadow-[0_24px_70px_-20px_rgba(10,37,48,0.65)] sm:inset-x-auto sm:right-6 sm:bottom-6 sm:w-[410px] sm:rounded-[28px] sm:ring-1 sm:ring-mist"
        >
          <div className="flex items-center justify-between gap-3 bg-ink px-4 py-3.5 text-frost">
            <div className="flex min-w-0 items-center gap-3">
              <span aria-hidden className="relative grid h-10 w-10 shrink-0 place-items-center rounded-full bg-deep text-sun">
                <svg width="22" height="22" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
                  <path d="M16 3v26M4.7 9.5l22.6 13M4.7 22.5l22.6-13" />
                </svg>
                <span className={`absolute right-0 bottom-0 h-3 w-3 rounded-full ring-2 ring-ink ${chat?.paused ? "bg-sun" : "bg-ok"}`} />
              </span>
              <div className="min-w-0">
              <h2 id="chat-title" className="title text-lg leading-tight">
                Lamig receptionist
              </h2>
              <p className="truncate text-sm text-mist">
                {chat?.paused ? "You are chatting with our staff." : "AI assistant. It can check times and book for you."}
              </p>
              </div>
            </div>
            <button type="button" onClick={closeChat} className="shrink-0 rounded-full p-2 hover:bg-white/10" aria-label="Close chat">
              <svg aria-hidden width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>

          <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-5" aria-live="polite">
            <Bubble role="assistant" content={GREETING} />
            {messages.map((m, i) => (
              <Bubble key={m.id ?? `local-${i}`} role={m.role} content={m.content} />
            ))}
            {sending && (
              <p className="flex items-center gap-2 text-sm text-steel" role="status">
                {!chat?.paused && (
                  <span aria-hidden className="flex gap-1 rounded-2xl rounded-bl-md bg-white px-3 py-2.5 ring-1 ring-mist">
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-steel" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-steel [animation-delay:120ms]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-steel [animation-delay:240ms]" />
                  </span>
                )}
                {chat?.paused ? "Sending…" : "Receptionist is typing…"}
              </p>
            )}
            {chat?.paused && !sending && (
              <p className="rounded-xl bg-sun/15 px-3 py-2 text-center text-sm text-ink" role="status">
                A Lamig staff member is answering this chat. Their replies show up here.
              </p>
            )}
            {error && (
              <p className="rounded-xl border border-bad/30 bg-white px-3 py-2 text-sm text-bad" role="alert">
                {error}
              </p>
            )}
          </div>

          <form
            className="border-t border-mist/70 bg-white px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
          >
            <label htmlFor="chat-input" className="sr-only">
              Message
            </label>
            <div className="flex items-end gap-2 rounded-2xl bg-frost p-1.5 ring-1 ring-mist focus-within:ring-2 focus-within:ring-ink">
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
                className="max-h-32 min-h-10 w-full resize-none bg-transparent px-2.5 py-2 text-ink placeholder:text-steel/70 focus:outline-none"
              />
              <button type="submit" className="btn btn-sun h-10 shrink-0 px-4 py-0" disabled={sending || !draft.trim()}>
                Send
              </button>
            </div>
            {messages.length > 0 && (
              <button type="button" onClick={startOver} className="mt-2 ml-1 text-sm text-steel underline underline-offset-2 hover:text-ink">
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
  const staff = role === "staff";
  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <p
        className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 whitespace-pre-line shadow-[0_1px_2px_rgba(10,37,48,0.06)] ${
          mine
            ? "rounded-br-md bg-ink text-frost"
            : staff
              ? "rounded-bl-md bg-white text-ink ring-[1.5px] ring-sun"
              : "rounded-bl-md bg-white text-ink ring-1 ring-mist/80"
        }`}
      >
        <span className={staff ? "mb-0.5 block text-xs font-bold text-sun-deep" : "sr-only"}>
          {mine ? "You: " : staff ? "Lamig staff" : "Receptionist: "}
        </span>
        {content}
      </p>
    </div>
  );
}