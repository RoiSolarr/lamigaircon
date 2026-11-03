"use client";

import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

export type ThreadMessage = { id: number; who: string; role: "user" | "assistant" | "staff"; content: string; time: string };

const STEP = 5;

const STYLE = {
  user: { side: "justify-start", bubble: "rounded-bl-md bg-frost text-ink" },
  assistant: { side: "justify-end", bubble: "rounded-br-md bg-ink text-frost" },
  staff: { side: "justify-end", bubble: "rounded-br-md bg-sun/25 text-deep ring-1 ring-sun" },
} as const;

// The messages of one chat. Shows the 5 newest, with a button for 5 more,
// so the reply box stays in view. Pass key={conversationId} so it resets.
export function InboxThread({ messages }: { messages: ThreadMessage[] }) {
  const [shown, setShown] = useState(STEP);
  const boxRef = useRef<HTMLDivElement>(null);
  const keepFromBottom = useRef<number | null>(null);
  const lastCount = useRef(0);

  const visible = messages.slice(-shown);
  const earlier = messages.length - visible.length;

  // Older messages appear above: keep the ones you were reading in place.
  useLayoutEffect(() => {
    const box = boxRef.current;
    if (box && keepFromBottom.current !== null) {
      box.scrollTop = box.scrollHeight - keepFromBottom.current;
      keepFromBottom.current = null;
    }
  }, [shown]);

  // New messages (and the first load) scroll to the newest one.
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    if (messages.length !== lastCount.current) {
      box.scrollTop = box.scrollHeight;
      lastCount.current = messages.length;
    }
  }, [messages.length]);

  function showMore() {
    const box = boxRef.current;
    if (box) keepFromBottom.current = box.scrollHeight - box.scrollTop;
    setShown((n) => n + STEP);
  }

  return (
    <div ref={boxRef} className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6" aria-label="Messages">
      {earlier > 0 && (
        <div className="mb-5 flex items-center gap-3">
          <span aria-hidden className="h-px flex-1 bg-mist/70" />
          <button type="button" onClick={showMore} className="btn btn-quiet btn-sm">
            Load {Math.min(STEP, earlier)} earlier message{Math.min(STEP, earlier) === 1 ? "" : "s"}
          </button>
          <span aria-hidden className="h-px flex-1 bg-mist/70" />
        </div>
      )}
      {earlier > 0 && <p className="sr-only">{earlier} earlier messages are hidden.</p>}

      {messages.length === 0 ? (
        <p className="py-10 text-center text-steel">No messages in this chat yet.</p>
      ) : (
        <ol className="space-y-3">
          {visible.map((m) => {
            const style = STYLE[m.role] ?? STYLE.assistant;
            return (
              <li key={m.id} className={`flex ${style.side}`}>
                <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 sm:max-w-[75%] ${style.bubble}`}>
                  <p className="text-xs opacity-70">
                    {m.who}, {m.time}
                  </p>
                  <p className="whitespace-pre-line">{m.content}</p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

// Reloads the inbox every few seconds while the tab is open, so new customer
// messages show up without pressing refresh. Text typed in the reply box stays.
export function AutoRefresh({ seconds = 10 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, seconds * 1000);
    return () => clearInterval(timer);
  }, [router, seconds]);
  return null;
}
