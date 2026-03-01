import { useState } from "react";
import useSignaling from "./hooks/useSignaling";
import useWebRTC from "./hooks/useWebRTC";
import useFileTransfer from "./hooks/useFileTransfer";
import Landing from "./components/Landing";
import SendFile from "./components/SendFile";
import Transfer from "./components/Transfer";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function formatFileSize(bytes) {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1) + " " + units[i];
}

// ---------------------------------------------------------------------------
// App — top-level state machine
//
// Phase derivation (from signaling + WebRTC + transfer state):
//   "landing"      – no role, user picks Send or Receive
//   "send-waiting" – sender waiting for receiver to join the room
//   "connecting"   – WebRTC handshake in progress
//   "connected"    – data channel open, transfer about to start (brief)
//   "transferring" – file chunks flowing over the data channel
//   "complete"     – all bytes transferred successfully
// ---------------------------------------------------------------------------

export default function App() {
  const [file, setFile] = useState(null);
  const signaling = useSignaling();
  const webrtc = useWebRTC({
    role: signaling.role,
    peerReady: signaling.peerReady,
    sendSignal: signaling.sendSignal,
    onSignalRef: signaling.onSignalRef,
  });
  const transfer = useFileTransfer({
    dcRef: webrtc.dcRef,
    dataChannelReady: webrtc.dataChannelReady,
    role: signaling.role,
    file,
  });

  // Sender: user dropped/selected a file — create a room.
  const handleFileSelected = async (selectedFile) => {
    setFile(selectedFile);
    await signaling.createRoom();
  };

  // Receiver: user entered the 6-digit code — join the room.
  const handleJoinRoom = async (code) => {
    await signaling.joinRoom(code);
  };

  // Cancel / disconnect — return to landing.
  // WebRTC + transfer cleanup happen automatically via effect deps
  // when signaling.peerReady becomes false.
  const handleCancel = () => {
    setFile(null);
    signaling.disconnect();
  };

  // Derive phase from the three layers of state.
  const phase = !signaling.role
    ? "landing"
    : !signaling.peerReady
      ? "send-waiting"
      : !webrtc.dataChannelReady
        ? "connecting"
        : transfer.transferState === "transferring"
          ? "transferring"
          : transfer.transferState === "complete"
            ? "complete"
            : "connected"; // brief transition before transfer starts

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4">
      <header className="mb-8 text-center">
        <h1 className="text-4xl font-bold text-white tracking-tight">
          P2P Beam
        </h1>
        <p className="mt-2 text-gray-400 text-sm">
          Send files directly between browsers. No upload, no storage.
        </p>
      </header>

      <main className="w-full max-w-2xl">
        {phase === "landing" && (
          <Landing
            onFileSelected={handleFileSelected}
            onJoinRoom={handleJoinRoom}
            error={signaling.error}
          />
        )}

        {phase === "send-waiting" && (
          <SendFile
            roomCode={signaling.roomCode}
            file={file}
            onCancel={handleCancel}
          />
        )}

        {phase !== "landing" && phase !== "send-waiting" && (
          <Transfer
            phase={phase}
            role={signaling.role}
            file={file}
            rtcState={webrtc.rtcState}
            rtcError={webrtc.error}
            transfer={transfer}
            onDisconnect={handleCancel}
          />
        )}
      </main>
    </div>
  );
}
