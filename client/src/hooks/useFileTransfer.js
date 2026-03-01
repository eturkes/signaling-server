import { useState, useRef, useEffect } from "react";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CHUNK_SIZE = 64 * 1024; // 64 KB per chunk
const BUFFER_THRESHOLD = 1024 * 1024; // 1 MB — pause sending when bufferedAmount exceeds this
const PROGRESS_INTERVAL = 50; // ms — throttle React state updates

// ---------------------------------------------------------------------------
// useFileTransfer — orchestrates chunked file transfer over RTCDataChannel
//
// Sender flow:
//   1. Data channel opens → send metadata JSON (name, size, type)
//   2. Read file in 64 KB slices via file.slice() (constant memory)
//   3. Send each slice as an ArrayBuffer
//   4. Monitor dc.bufferedAmount; pause when > 1 MB, resume on
//      onbufferedamountlow to prevent buffer bloat
//   5. When all bytes sent → "complete"
//
// Receiver flow:
//   1. First dc.onmessage is a JSON string → parse as metadata
//   2. Subsequent messages are ArrayBuffer chunks → push to array
//   3. When total received bytes >= metadata.size → reassemble into Blob,
//      create an object URL, trigger automatic download via hidden <a>
//
// Exposes:
//   transferState    – "idle" | "transferring" | "complete" | "error"
//   bytesTransferred – bytes sent (sender) or received (receiver)
//   totalBytes       – total file size
//   fileName         – original filename (from file or metadata)
//   speed            – average bytes/second
//   error            – error message string or null
//   downloadUrl      – object URL for the received file (receiver only)
// ---------------------------------------------------------------------------
export default function useFileTransfer({
  dcRef,
  dataChannelReady,
  role,
  file,
}) {
  const [transferState, setTransferState] = useState("idle");
  const [bytesTransferred, setBytesTransferred] = useState(0);
  const [totalBytes, setTotalBytes] = useState(0);
  const [fileName, setFileName] = useState("");
  const [speed, setSpeed] = useState(0);
  const [error, setError] = useState(null);
  const [downloadUrl, setDownloadUrl] = useState(null);

  const startTimeRef = useRef(null);
  const downloadUrlRef = useRef(null);

  useEffect(() => {
    if (!dataChannelReady || !dcRef.current) return;

    const dc = dcRef.current;
    const abort = new AbortController();

    // Reset for a new transfer.
    setBytesTransferred(0);
    setSpeed(0);
    setError(null);
    setTransferState("idle");

    // Revoke any previous download URL.
    if (downloadUrlRef.current) {
      URL.revokeObjectURL(downloadUrlRef.current);
      downloadUrlRef.current = null;
      setDownloadUrl(null);
    }

    // ---------------------------------------------------------------
    // Detect data channel closing mid-transfer (e.g. peer navigated
    // away). Uses addEventListener so it doesn't clobber useWebRTC's
    // onclose property handler.
    // ---------------------------------------------------------------
    const handleDcClose = () => {
      if (
        !abort.signal.aborted &&
        transferStateRef.current === "transferring"
      ) {
        setTransferState("error");
        setError("Connection lost during transfer");
      }
    };
    // Mutable ref so the close handler can read the latest transferState
    // without a stale closure.
    const transferStateRef = { current: "idle" };

    dc.addEventListener("close", handleDcClose);

    // ---------------------------------------------------------------
    // SENDER
    // ---------------------------------------------------------------
    if (role === "sender" && file) {
      setTotalBytes(file.size);
      setFileName(file.name);
      setTransferState("transferring");
      transferStateRef.current = "transferring";
      startTimeRef.current = Date.now();

      sendFile(dc, file, abort.signal, (sent) => {
        setBytesTransferred(sent);
        const elapsed = (Date.now() - startTimeRef.current) / 1000;
        if (elapsed > 0.5) setSpeed(sent / elapsed);
      })
        .then(() => {
          if (!abort.signal.aborted) {
            setBytesTransferred(file.size);
            setTransferState("complete");
            transferStateRef.current = "complete";
            const elapsed =
              (Date.now() - startTimeRef.current) / 1000;
            if (elapsed > 0) setSpeed(file.size / elapsed);
          }
        })
        .catch((err) => {
          if (!abort.signal.aborted) {
            setTransferState("error");
            transferStateRef.current = "error";
            setError(err.message);
          }
        });
    }

    // ---------------------------------------------------------------
    // RECEIVER
    // ---------------------------------------------------------------
    if (role === "receiver") {
      const chunks = [];
      let metadata = null;
      let received = 0;
      let lastUpdate = 0;
      startTimeRef.current = null;

      dc.onmessage = (event) => {
        // -- Metadata (JSON string) --
        if (typeof event.data === "string") {
          try {
            metadata = JSON.parse(event.data);
          } catch {
            setTransferState("error");
            transferStateRef.current = "error";
            setError("Invalid metadata from sender");
            return;
          }

          setTotalBytes(metadata.size);
          setFileName(metadata.name);
          setTransferState("transferring");
          transferStateRef.current = "transferring";
          startTimeRef.current = Date.now();

          // Handle zero-byte files.
          if (metadata.size === 0) {
            finishReceive(
              [],
              metadata,
              setDownloadUrl,
              downloadUrlRef,
              setTransferState,
              transferStateRef,
              setBytesTransferred,
              setSpeed,
              startTimeRef,
            );
          }
          return;
        }

        // -- Binary chunk (ArrayBuffer) --
        if (!metadata) return;

        chunks.push(event.data);
        received += event.data.byteLength;

        // Throttle progress state updates.
        const now = Date.now();
        if (
          now - lastUpdate >= PROGRESS_INTERVAL ||
          received >= metadata.size
        ) {
          setBytesTransferred(received);
          const elapsed = (now - startTimeRef.current) / 1000;
          if (elapsed > 0.5) setSpeed(received / elapsed);
          lastUpdate = now;
        }

        // All bytes received — reassemble and download.
        if (received >= metadata.size) {
          finishReceive(
            chunks,
            metadata,
            setDownloadUrl,
            downloadUrlRef,
            setTransferState,
            transferStateRef,
            setBytesTransferred,
            setSpeed,
            startTimeRef,
          );
          // Free chunk array memory.
          chunks.length = 0;
        }
      };
    }

    // ---------------------------------------------------------------
    // Cleanup
    // ---------------------------------------------------------------
    return () => {
      abort.abort();
      dc.removeEventListener("close", handleDcClose);
      if (dcRef.current) dcRef.current.onmessage = null;

      if (downloadUrlRef.current) {
        URL.revokeObjectURL(downloadUrlRef.current);
        downloadUrlRef.current = null;
      }
    };
  }, [dataChannelReady, role, file, dcRef]);

  return {
    transferState,
    bytesTransferred,
    totalBytes,
    fileName,
    speed,
    error,
    downloadUrl,
  };
}

// ---------------------------------------------------------------------------
// Send a file in 64 KB chunks with flow control
//
// Uses file.slice() to read one chunk at a time, so memory usage stays
// bounded regardless of file size. Pauses when the data channel's send
// buffer exceeds BUFFER_THRESHOLD and resumes via onbufferedamountlow.
// ---------------------------------------------------------------------------
async function sendFile(dc, file, signal, onProgress) {
  // 1. Send metadata as a JSON string.
  dc.send(
    JSON.stringify({
      name: file.name,
      size: file.size,
      type: file.type || "application/octet-stream",
    }),
  );

  // 2. Send binary chunks.
  let offset = 0;
  let lastProgressTime = 0;

  while (offset < file.size) {
    // Abort check.
    if (signal.aborted || dc.readyState !== "open") {
      throw new Error("Transfer cancelled");
    }

    // Flow control — wait for the send buffer to drain.
    if (dc.bufferedAmount > BUFFER_THRESHOLD) {
      await waitForBufferDrain(dc, signal);
      if (signal.aborted || dc.readyState !== "open") {
        throw new Error("Transfer cancelled");
      }
    }

    // Read one 64 KB slice from disk.
    const end = Math.min(offset + CHUNK_SIZE, file.size);
    const slice = file.slice(offset, end);
    const buffer = await slice.arrayBuffer();

    if (signal.aborted || dc.readyState !== "open") {
      throw new Error("Transfer cancelled");
    }

    dc.send(buffer);
    offset = end;

    // Throttle progress callbacks.
    const now = Date.now();
    if (now - lastProgressTime >= PROGRESS_INTERVAL || offset >= file.size) {
      onProgress(offset);
      lastProgressTime = now;
    }
  }
}

// ---------------------------------------------------------------------------
// Wait for dc.bufferedAmount to drop below threshold
// ---------------------------------------------------------------------------
function waitForBufferDrain(dc, signal) {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }

    dc.bufferedAmountLowThreshold = BUFFER_THRESHOLD;

    const onLow = () => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    };
    const onAbort = () => {
      dc.onbufferedamountlow = null;
      resolve();
    };

    dc.onbufferedamountlow = onLow;
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

// ---------------------------------------------------------------------------
// Receiver: reassemble chunks into a Blob and trigger download
// ---------------------------------------------------------------------------
function finishReceive(
  chunks,
  metadata,
  setDownloadUrl,
  downloadUrlRef,
  setTransferState,
  transferStateRef,
  setBytesTransferred,
  setSpeed,
  startTimeRef,
) {
  const blob = new Blob(chunks, { type: metadata.type });
  const url = URL.createObjectURL(blob);
  downloadUrlRef.current = url;
  setDownloadUrl(url);

  // Trigger automatic download via a hidden <a> element.
  const a = document.createElement("a");
  a.href = url;
  a.download = metadata.name;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => document.body.removeChild(a), 100);

  setBytesTransferred(metadata.size);
  setTransferState("complete");
  transferStateRef.current = "complete";

  const elapsed = (Date.now() - startTimeRef.current) / 1000;
  if (elapsed > 0) setSpeed(metadata.size / elapsed);
}
