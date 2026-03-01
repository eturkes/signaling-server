import { createServer } from "node:http";
import express from "express";
import { WebSocketServer } from "ws";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const PORT = process.env.PORT || 3001;

// ---------------------------------------------------------------------------
// Express — minimal HTTP layer (health-check + future static file serving)
// ---------------------------------------------------------------------------

const app = express();

app.get("/health", (_req, res) => {
  res.json({ status: "ok", rooms: rooms.size });
});

const httpServer = createServer(app);

// ---------------------------------------------------------------------------
// Room management
//
// Each room is identified by a 6-digit numeric code and contains at most two
// WebSocket connections (sender and receiver). The Map key is the room code;
// the value is a Set of ws clients.
// ---------------------------------------------------------------------------

/** @type {Map<string, Set<import('ws').WebSocket>>} */
const rooms = new Map();

/** Generate a random 6-digit room code that isn't already in use. */
function generateRoomCode() {
  let code;
  do {
    code = String(Math.floor(100000 + Math.random() * 900000));
  } while (rooms.has(code));
  return code;
}

// ---------------------------------------------------------------------------
// WebSocket signaling server
// ---------------------------------------------------------------------------

const wss = new WebSocketServer({ server: httpServer });

wss.on("connection", (ws) => {
  // Per-connection state
  let currentRoom = null;

  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      ws.send(JSON.stringify({ type: "error", message: "Invalid JSON" }));
      return;
    }

    switch (msg.type) {
      // ---------------------------------------------------------------
      // join-room
      //
      // Two sub-cases:
      //   1. No `roomCode` → sender is creating a new room.
      //   2. With `roomCode` → receiver is joining an existing room.
      // ---------------------------------------------------------------
      case "join-room": {
        // Prevent joining multiple rooms on a single connection.
        if (currentRoom) {
          ws.send(
            JSON.stringify({
              type: "error",
              message: "Already in a room",
            })
          );
          return;
        }

        if (msg.roomCode) {
          // --- Receiver joining an existing room ---
          const room = rooms.get(msg.roomCode);

          if (!room) {
            ws.send(
              JSON.stringify({ type: "error", message: "Room not found" })
            );
            return;
          }

          if (room.size >= 2) {
            ws.send(
              JSON.stringify({ type: "error", message: "Room is full" })
            );
            return;
          }

          room.add(ws);
          currentRoom = msg.roomCode;

          ws.send(
            JSON.stringify({
              type: "room-joined",
              roomCode: msg.roomCode,
              role: "receiver",
            })
          );

          // Notify the sender that a peer has arrived so it can create the
          // WebRTC offer.
          relay(msg.roomCode, ws, {
            type: "peer-joined",
          });

          log(`Receiver joined room ${msg.roomCode}`);
        } else {
          // --- Sender creating a new room ---
          const roomCode = generateRoomCode();
          const room = new Set([ws]);
          rooms.set(roomCode, room);
          currentRoom = roomCode;

          ws.send(
            JSON.stringify({
              type: "room-joined",
              roomCode,
              role: "sender",
            })
          );

          log(`Sender created room ${roomCode}`);
        }
        break;
      }

      // ---------------------------------------------------------------
      // offer / answer / ice-candidate — relay to the other peer
      // ---------------------------------------------------------------
      case "offer":
      case "answer":
      case "ice-candidate": {
        if (!currentRoom) {
          ws.send(
            JSON.stringify({
              type: "error",
              message: "Not in a room",
            })
          );
          return;
        }

        relay(currentRoom, ws, msg);
        break;
      }

      default:
        ws.send(
          JSON.stringify({
            type: "error",
            message: `Unknown message type: ${msg.type}`,
          })
        );
    }
  });

  // -----------------------------------------------------------------------
  // Cleanup on disconnect
  // -----------------------------------------------------------------------
  ws.on("close", () => {
    if (!currentRoom) return;

    const room = rooms.get(currentRoom);
    if (!room) return;

    room.delete(ws);

    // Notify the remaining peer that the other side disconnected.
    for (const peer of room) {
      peer.send(JSON.stringify({ type: "peer-left" }));
    }

    // Destroy empty rooms.
    if (room.size === 0) {
      rooms.delete(currentRoom);
      log(`Room ${currentRoom} destroyed (empty)`);
    }

    log(`Client disconnected from room ${currentRoom}`);
    currentRoom = null;
  });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Send a message to every peer in `roomCode` *except* the `sender` socket.
 * This is the core relay mechanism — the server never inspects the payload.
 */
function relay(roomCode, sender, message) {
  const room = rooms.get(roomCode);
  if (!room) return;

  const data = JSON.stringify(message);
  for (const peer of room) {
    if (peer !== sender && peer.readyState === peer.OPEN) {
      peer.send(data);
    }
  }
}

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

httpServer.listen(PORT, () => {
  log(`P2P Beam signaling server listening on http://localhost:${PORT}`);
});
