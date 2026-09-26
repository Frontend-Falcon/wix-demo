// app/components/ViewPostModal.tsx
"use client";

import { useEffect } from "react";

interface ViewPostModalProps {
  url: string;
  onClose: () => void;
}

export function ViewPostModal({ url, onClose }: ViewPostModalProps) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
      <div
        className="glass-panel w-full max-w-3xl p-0"
        role="dialog"
        aria-modal="true"
        aria-label="Published post preview"
      >
        <div className="flex items-center justify-between border-b border-white/30 px-5 py-3.5 dark:border-white/10">
          <h2 className="text-sm font-medium text-zinc-900 dark:text-zinc-50">Published</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-zinc-700 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-50"
          >
            Close
          </button>
        </div>
        <div className="p-5">
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium text-blue-600 hover:underline dark:text-blue-400"
          >
            View on site →
          </a>
          <iframe
            src={url}
            title="Published post preview"
            className="mt-3 h-[60vh] w-full rounded-2xl border border-white/30 dark:border-white/10"
            sandbox="allow-scripts allow-same-origin allow-popups"
            referrerPolicy="no-referrer"
          />
        </div>
      </div>
    </div>
  );
}
