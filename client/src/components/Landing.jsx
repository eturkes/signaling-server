import { useState, useRef } from "react";

// ---------------------------------------------------------------------------
// Inline SVG icons (Heroicons outline, MIT license)
// ---------------------------------------------------------------------------

function UploadIcon({ className }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      className={className}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5"
      />
    </svg>
  );
}

function DownloadIcon({ className }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      className={className}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M7.5 12l4.5 4.5m0 0 4.5-4.5M12 16.5V3"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Landing — initial screen with "Send a File" and "Receive a File" options
// ---------------------------------------------------------------------------

export default function Landing({ onFileSelected, onJoinRoom, error }) {
  const [isDragging, setIsDragging] = useState(false);
  const [roomCode, setRoomCode] = useState("");
  const [joining, setJoining] = useState(false);
  const fileInputRef = useRef(null);

  // Track nested drag events so we only clear the highlight when the
  // pointer truly leaves the drop zone (not just a child element).
  const dragCounterRef = useRef(0);

  // ----- Drag-and-drop handlers -----

  const handleDragEnter = (e) => {
    e.preventDefault();
    dragCounterRef.current++;
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) setIsDragging(false);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    dragCounterRef.current = 0;
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) onFileSelected(file);
  };

  const handleFileInput = (e) => {
    const file = e.target.files[0];
    if (file) onFileSelected(file);
  };

  // ----- Join room -----

  const handleJoin = async () => {
    if (roomCode.length !== 6) return;
    setJoining(true);
    await onJoinRoom(roomCode);
    setJoining(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") handleJoin();
  };

  return (
    <div className="grid gap-6 md:grid-cols-2">
      {/* ---- Send a File ---- */}
      <div
        className={`
          rounded-2xl border-2 border-dashed p-8 text-center
          transition-colors cursor-pointer select-none
          ${
            isDragging
              ? "border-orange-400 bg-orange-500/10"
              : "border-stone-700 bg-stone-900/60 hover:border-stone-500"
          }
        `}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={handleFileInput}
        />

        <UploadIcon className="mx-auto h-12 w-12 text-stone-500 mb-4" />
        <h2 className="text-xl font-semibold text-white mb-2">Send a File</h2>
        <p className="text-stone-400 text-sm">
          {isDragging
            ? "Drop to select"
            : "Drag & drop a file here, or click to browse"}
        </p>
      </div>

      {/* ---- Receive a File ---- */}
      <div className="rounded-2xl border border-stone-800 bg-stone-900/60 p-8 text-center">
        <DownloadIcon className="mx-auto h-12 w-12 text-stone-500 mb-4" />
        <h2 className="text-xl font-semibold text-white mb-4">
          Receive a File
        </h2>
        <p className="text-stone-400 text-sm mb-4">
          Enter the 6-digit code from the sender
        </p>

        <input
          type="text"
          inputMode="numeric"
          maxLength={6}
          value={roomCode}
          onChange={(e) => setRoomCode(e.target.value.replace(/\D/g, ""))}
          onKeyDown={handleKeyDown}
          placeholder="000000"
          className="
            w-full rounded-lg bg-stone-800 border border-stone-700 px-4 py-3
            text-center text-2xl font-mono tracking-[0.3em] text-white
            placeholder:text-stone-600 focus:outline-none focus:border-orange-500
            transition-colors
          "
        />

        <button
          onClick={handleJoin}
          disabled={roomCode.length !== 6 || joining}
          className="
            mt-4 w-full rounded-lg bg-orange-600 px-4 py-3 font-medium
            text-white hover:bg-orange-500 transition-colors
            disabled:opacity-40 disabled:cursor-not-allowed
          "
        >
          {joining ? "Connecting..." : "Connect"}
        </button>

        {error && <p className="mt-3 text-sm text-rose-400">{error}</p>}
      </div>
    </div>
  );
}
