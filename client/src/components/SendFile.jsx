import { useState } from "react";
import { formatFileSize } from "../App";

// ---------------------------------------------------------------------------
// SendFile — shown after the sender selects a file and a room is created.
// Displays the 6-digit room code and waits for the receiver to join.
// ---------------------------------------------------------------------------

export default function SendFile({ roomCode, file, onCancel }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(roomCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API unavailable (non-secure context) — ignore gracefully.
    }
  };

  return (
    <div className="rounded-2xl border border-gray-800 bg-gray-900/60 p-8 text-center">
      <h2 className="text-xl font-semibold text-white mb-6">
        Waiting for receiver...
      </h2>

      {/* ---- Room code ---- */}
      <p className="text-gray-400 text-sm mb-3">
        Share this code with the receiver:
      </p>

      <div className="flex items-center justify-center gap-3 mb-6">
        <div className="flex gap-2">
          {roomCode?.split("").map((digit, i) => (
            <span
              key={i}
              className="
                inline-flex items-center justify-center w-12 h-14
                rounded-lg bg-gray-800 border border-gray-700
                text-2xl font-mono font-bold text-white
              "
            >
              {digit}
            </span>
          ))}
        </div>

        <button
          onClick={handleCopy}
          className="
            rounded-lg bg-gray-800 border border-gray-700 px-3 py-2
            text-sm text-gray-300 hover:bg-gray-700 transition-colors
          "
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>

      {/* ---- Waiting dots ---- */}
      <div className="flex justify-center gap-1.5 mb-6">
        <span className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce [animation-delay:0ms]" />
        <span className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce [animation-delay:150ms]" />
        <span className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce [animation-delay:300ms]" />
      </div>

      {/* ---- File info ---- */}
      {file && (
        <div className="rounded-lg bg-gray-800/50 px-4 py-3 mb-6 inline-flex items-center gap-3">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            className="h-6 w-6 text-gray-400 shrink-0"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
            />
          </svg>
          <div className="text-left">
            <p className="text-sm font-medium text-white truncate max-w-xs">
              {file.name}
            </p>
            <p className="text-xs text-gray-400">
              {formatFileSize(file.size)}
            </p>
          </div>
        </div>
      )}

      <div>
        <button
          onClick={onCancel}
          className="
            rounded-lg border border-gray-700 px-6 py-2
            text-sm text-gray-300 hover:bg-gray-800 transition-colors
          "
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
