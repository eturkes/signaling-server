import { formatFileSize } from "../App";

// ---------------------------------------------------------------------------
// Inline SVG icons
// ---------------------------------------------------------------------------

function CheckCircleIcon({ className }) {
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
        d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
      />
    </svg>
  );
}

function XCircleIcon({ className }) {
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
        d="m9.75 9.75 4.5 4.5m0-4.5-4.5 4.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
      />
    </svg>
  );
}

function FileIcon({ className }) {
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
        d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
      />
    </svg>
  );
}

function ArrowDownTrayIcon({ className }) {
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
// Formatting helpers
// ---------------------------------------------------------------------------

function formatSpeed(bytesPerSecond) {
  if (bytesPerSecond <= 0) return "0 B/s";
  return formatFileSize(bytesPerSecond) + "/s";
}

function formatDuration(seconds) {
  if (seconds < 60) return seconds.toFixed(1) + "s";
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m + "m " + s + "s";
}

function formatEta(bytesRemaining, speed) {
  if (speed <= 0) return "";
  const seconds = bytesRemaining / speed;
  if (seconds < 1) return "< 1s remaining";
  if (seconds < 60) return "~" + Math.ceil(seconds) + "s remaining";
  const m = Math.floor(seconds / 60);
  const s = Math.ceil(seconds % 60);
  return "~" + m + "m " + s + "s remaining";
}

// ---------------------------------------------------------------------------
// Transfer — unified component for all post-room-join states.
//
// Visual states driven by `phase` prop:
//   "connecting"   → spinner, "Establishing connection..."
//   "connected"    → spinner, "Starting transfer..." (brief)
//   "transferring" → progress bar, speed, ETA
//   "complete"     → green check, summary, download-again (receiver)
//
// Errors are detected independently via rtcState or transfer.transferState.
// ---------------------------------------------------------------------------

export default function Transfer({
  phase,
  role,
  file,
  rtcState,
  rtcError,
  transfer,
  onDisconnect,
}) {
  const isFailed =
    rtcState === "failed" || transfer.transferState === "error";
  const errorMessage =
    transfer.error || rtcError || "Connection failed.";

  const isTransferring = phase === "transferring";
  const isComplete = phase === "complete";

  // Use transfer hook data, fall back to the File object for the brief
  // "connected" phase before the transfer hook has set its state.
  const displayName = transfer.fileName || file?.name || "";
  const displayTotal = transfer.totalBytes || file?.size || 0;
  const percent =
    displayTotal > 0
      ? Math.min(100, (transfer.bytesTransferred / displayTotal) * 100)
      : 0;

  // -----------------------------------------------------------------------
  // ERROR
  // -----------------------------------------------------------------------
  if (isFailed) {
    return (
      <div className="rounded-2xl border border-gray-800 bg-gray-900/60 p-8 text-center">
        <XCircleIcon className="mx-auto h-12 w-12 text-red-400 mb-4" />
        <h2 className="text-xl font-semibold text-white mb-2">
          {transfer.transferState === "error"
            ? "Transfer Failed"
            : "Connection Failed"}
        </h2>
        <p className="text-gray-400 text-sm mb-6">{errorMessage}</p>
        <button onClick={onDisconnect} className={btnClass}>
          Disconnect
        </button>
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // CONNECTING / CONNECTED (brief transition)
  // -----------------------------------------------------------------------
  if (!isTransferring && !isComplete) {
    return (
      <div className="rounded-2xl border border-gray-800 bg-gray-900/60 p-8 text-center">
        <div className="mx-auto h-12 w-12 rounded-full border-4 border-gray-700 border-t-indigo-400 animate-spin mb-4" />
        <h2 className="text-xl font-semibold text-white mb-2">
          {phase === "connecting"
            ? "Establishing connection..."
            : "Starting transfer..."}
        </h2>
        <p className="text-gray-400 text-sm mb-1">
          {phase === "connecting"
            ? "Negotiating a direct peer-to-peer link..."
            : role === "sender"
              ? "Preparing to send the file..."
              : "Waiting for file metadata..."}
        </p>
        {phase === "connecting" && (
          <p className="text-gray-600 text-xs mb-6">
            RTC state: {rtcState}
          </p>
        )}
        {phase !== "connecting" && <div className="mb-6" />}

        {/* File info (sender only, during connecting/connected) */}
        {file && <FileInfo name={file.name} size={file.size} />}

        <button onClick={onDisconnect} className={btnClass}>
          Cancel
        </button>
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // TRANSFERRING
  // -----------------------------------------------------------------------
  if (isTransferring) {
    const eta = formatEta(
      displayTotal - transfer.bytesTransferred,
      transfer.speed,
    );

    return (
      <div className="rounded-2xl border border-gray-800 bg-gray-900/60 p-8 text-center">
        <h2 className="text-xl font-semibold text-white mb-4">
          {role === "sender" ? "Sending file..." : "Receiving file..."}
        </h2>

        <FileInfo name={displayName} size={displayTotal} />

        {/* Progress bar */}
        <div className="w-full bg-gray-800 rounded-full h-3 mb-3 overflow-hidden">
          <div
            className="bg-indigo-500 h-3 rounded-full transition-[width] duration-150 ease-linear"
            style={{ width: percent + "%" }}
          />
        </div>

        {/* Stats row */}
        <div className="flex items-center justify-between text-xs text-gray-400 mb-6">
          <span>
            {formatFileSize(transfer.bytesTransferred)} /{" "}
            {formatFileSize(displayTotal)}
          </span>
          <span>{percent.toFixed(1)}%</span>
        </div>

        <div className="flex items-center justify-center gap-4 text-xs text-gray-500 mb-6">
          {transfer.speed > 0 && <span>{formatSpeed(transfer.speed)}</span>}
          {transfer.speed > 0 && eta && (
            <>
              <span className="text-gray-700">|</span>
              <span>{eta}</span>
            </>
          )}
        </div>

        <button onClick={onDisconnect} className={btnClass}>
          Cancel
        </button>
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // COMPLETE
  // -----------------------------------------------------------------------
  const duration =
    displayTotal > 0 && transfer.speed > 0
      ? displayTotal / transfer.speed
      : 0;

  return (
    <div className="rounded-2xl border border-gray-800 bg-gray-900/60 p-8 text-center">
      <CheckCircleIcon className="mx-auto h-12 w-12 text-emerald-400 mb-4" />
      <h2 className="text-xl font-semibold text-white mb-2">
        Transfer Complete!
      </h2>
      <p className="text-gray-400 text-sm mb-6">
        {role === "sender"
          ? `${displayName} was sent successfully.`
          : `${displayName} has been saved.`}
      </p>

      {/* Full progress bar */}
      <div className="w-full bg-gray-800 rounded-full h-3 mb-3 overflow-hidden">
        <div className="bg-emerald-500 h-3 rounded-full w-full" />
      </div>

      {/* Summary stats */}
      <p className="text-xs text-gray-500 mb-6">
        {formatFileSize(displayTotal)} transferred
        {duration > 0 && (
          <> in {formatDuration(duration)} ({formatSpeed(transfer.speed)})</>
        )}
      </p>

      {/* Receiver: download-again link */}
      {role === "receiver" && transfer.downloadUrl && (
        <a
          href={transfer.downloadUrl}
          download={displayName}
          className="
            inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2
            text-sm font-medium text-white hover:bg-indigo-500 transition-colors mb-4
          "
        >
          <ArrowDownTrayIcon className="h-4 w-4" />
          Download again
        </a>
      )}

      <div>
        <button onClick={onDisconnect} className={btnClass}>
          Done
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared sub-components / constants
// ---------------------------------------------------------------------------

const btnClass =
  "rounded-lg border border-gray-700 px-6 py-2 text-sm text-gray-300 hover:bg-gray-800 transition-colors";

function FileInfo({ name, size }) {
  return (
    <div className="rounded-lg bg-gray-800/50 px-4 py-3 mb-6 inline-flex items-center gap-3">
      <FileIcon className="h-6 w-6 text-gray-400 shrink-0" />
      <div className="text-left">
        <p className="text-sm font-medium text-white truncate max-w-xs">
          {name}
        </p>
        <p className="text-xs text-gray-400">{formatFileSize(size)}</p>
      </div>
    </div>
  );
}
