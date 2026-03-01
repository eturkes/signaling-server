# P2P Beam

Peer-to-peer file transfer between browsers. Files go directly from sender to receiver over WebRTC — the server only relays signaling messages and never touches file data.

## Prerequisites

- Node.js >= 20

## Quick Start

```bash
# Install both server and client dependencies
npm install && npm install --prefix client

# Terminal 1 — signaling server (port 3001)
npm run dev

# Terminal 2 — frontend dev server (port 5173)
cd client && npx vite
```

Open `http://localhost:5173` in two browser tabs. Drop a file in one, enter the code in the other.

## Project Structure

```
server.js                         WebSocket signaling server (Express + ws)
client/
  src/
    App.jsx                       Top-level state machine
    hooks/
      useSignaling.js             WebSocket connection and room management
      useWebRTC.js                RTCPeerConnection + RTCDataChannel lifecycle
      useFileTransfer.js          Chunked send/receive, flow control, auto-download
    components/
      Landing.jsx                 Drag-and-drop zone + room code input
      SendFile.jsx                Room code display + waiting state
      Transfer.jsx                Progress bar, speed/ETA, completion UI
```

## Architecture

### Signaling Server (`server.js`)

Manages rooms (6-digit codes, max 2 peers each) and relays four message types over WebSocket:

| Message | Direction | Purpose |
|---|---|---|
| `join-room` | client -> server | Create room (no code) or join room (with code) |
| `offer` / `answer` | relayed | SDP exchange for WebRTC negotiation |
| `ice-candidate` | relayed | ICE candidate trickle |

Server-generated events: `room-joined`, `peer-joined`, `peer-left`, `error`.

### Client State Machine

Phase is derived (not stored) from three layers of hook state:

```
useSignaling.role ── null ──────────> "landing"
                  ── !peerReady ───> "send-waiting"
useWebRTC.dataChannelReady ── false > "connecting"
useFileTransfer.transferState ─────> "connected" | "transferring" | "complete"
```

### File Transfer Protocol (over RTCDataChannel)

1. **Metadata** — sender sends a JSON string: `{ name, size, type }`
2. **Chunks** — sender sends 64 KB `ArrayBuffer` slices via `file.slice()` (constant memory regardless of file size)
3. **Flow control** — sender pauses when `dc.bufferedAmount > 1 MB`, resumes on `onbufferedamountlow`
4. **Reassembly** — receiver collects chunks, creates a `Blob` when all bytes arrive, triggers download via a hidden `<a>` element

## Dev Notes

- The Vite dev server proxies `/ws` to the signaling server on port 3001 (configured in `client/vite.config.js`). Both servers must be running during development.
- `server.js` uses `node --watch` in dev mode for auto-restart on changes.
- WebRTC connections use public Google STUN servers. No TURN server is configured, so transfers between peers behind symmetric NATs will fail to connect.
- `useWebRTC` uses `useLayoutEffect` (not `useEffect`) to attach the signaling message handler synchronously, preventing a race where the sender's offer arrives before the receiver's handler is ready.
- The chunking flow reads one 64 KB slice at a time via `file.slice().arrayBuffer()`, so sender memory stays bounded even for multi-GB files. Receiver memory grows with file size since chunks are held in an array until reassembly.

## Production Build

```bash
cd client && npx vite build
```

Output goes to `client/dist/`. Serve it from the signaling server or any static host — just point the WebSocket URL at the signaling server.
