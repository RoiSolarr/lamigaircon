"use client";

import { useRef } from "react";
import { lockScroll } from "@/lib/scroll-lock";
import { deleteAppointment } from "@/app/admin/actions";

// Trash icon for a finished booking. It opens a "Delete this booking?" box;
// the booking is deleted only after "Yes, delete" is pressed. Pressing it
// closes the box so the full screen loading screen shows while it deletes.
export function DeleteBookingButton({ id, bookingRef, label, back }: { id: string; bookingRef: string; label: string; back: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const unlock = useRef<(() => void) | null>(null);

  const open = () => {
    dialog.current?.showModal();
    unlock.current = lockScroll(); // the page behind the box does not scroll
  };

  return (
    <>
      <button
        type="button"
        onClick={open}
        aria-label={`Delete booking ${bookingRef}`}
        title="Delete booking"
        className="grid h-10 w-10 place-items-center rounded-full text-steel ring-1 ring-mist transition-colors hover:bg-bad/8 hover:text-bad hover:ring-bad/40"
      >
        <TrashIcon />
      </button>

      <dialog
        ref={dialog}
        aria-labelledby={`delete-${id}-title`}
        onClick={(e) => e.target === dialog.current && dialog.current?.close()}
        onClose={() => {
          unlock.current?.();
          unlock.current = null;
        }}
        className="m-auto w-[calc(100%-2rem)] max-w-md rounded-[28px] bg-white p-0 text-ink shadow-[var(--shadow-remote)] backdrop:bg-deep/60 backdrop:backdrop-blur-sm"
      >
        <form action={deleteAppointment} onSubmit={() => dialog.current?.close()} className="p-6 sm:p-8">
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="ref" value={bookingRef} />
          <input type="hidden" name="back" value={back} />
          <h2 id={`delete-${id}-title`} className="title text-2xl">Delete this booking?</h2>
          <p className="mt-2 text-steel">
            <span className="font-bold text-ink">{bookingRef}</span>, {label}. It is removed from Booking history, the
            customer page and the customer&apos;s account for good.
          </p>
          <div className="mt-6 grid grid-cols-2 gap-2">
            <button type="button" onClick={() => dialog.current?.close()} className="btn btn-quiet">
              Cancel
            </button>
            <button type="submit" className="btn bg-bad text-white hover:bg-bad/90">
              Yes, delete
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}

function TrashIcon() {
  return (
    <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
    </svg>
  );
}
