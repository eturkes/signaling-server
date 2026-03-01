import { useState, useRef, useCallback, useEffect } from "react";

// ---------------------------------------------------------------------------
// WebSocket URL
//
// In development Vite proxies /ws to the signaling server (see vite.config.js).
// In production the client is served from the same origin as the server, so
// the same path works without a proxy.
// ---------------------------------------------------------------------------
function getWsUrl() {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/ws`;
}

// ---------------------------------------------------------------------------
// useSignaling — manages the WebSocket connection and room lifecycle
//
// Exposes:
//   roomCode    – the 6-digit room code (null until joined)
//   role        – "sender" | "receiver" | null
//   peerReady   – true once both peers are in the room
//   error       – last error message (null when clear)
//   createRoom  – sender: open WS + create a new room
//   joinRoom    – receiver: open WS + join an existing room by code
//   sendSignal  – forward a signaling message (offer/answer/ice-candidate)
//   disconnect  – tear down WS and reset all state
//   onSignalRef – ref whose .current is called with incoming signaling msgs
//                 (offer/answer/ice-candidate). Step 3 will attach a handler.
// ---------------------------------------------------------------------------
export default function useSignaling() {
  const wsRef = useRef(null);
  const intentionalCloseRef = useRef(false);

  const [roomCode, setRoomCode] = useState(null);
  const [role, setRole] = useState(null);
  const [peerReady, setPeerReady] = useState(false);
  const [error, setError] = useState(null);

  // Step 3 will assign a callback here to receive offer/answer/ice-candidate
  // messages from the remote peer.
  const onSignalRef = useRef(null);

  // -------------------------------------------------------------------
  // Open a WebSocket to the signaling server, reusing an existing
  // connection if one is already open.
  // -------------------------------------------------------------------
  const connectWs = useCallback(() => {
    // Reuse an open connection (e.g. retry after "Room not found").
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return Promise.resolve(wsRef.current);
    }

    // Clean up any lingering half-open socket.
    wsRef.current?.close();

    return new Promise((resolve, reject) => {
      const ws = new WebSocket(getWsUrl());
      wsRef.current = ws;
      intentionalCloseRef.current = false;

      ws.onopen = () => resolve(ws);

      ws.onerror = () => {
        wsRef.current = null;
        reject(new Error("Failed to connect to signaling server"));
      };

      // -----------------------------------------------------------------
      // Route incoming messages
      // -----------------------------------------------------------------
      ws.onmessage = (event) => {
        let msg;
        try {
          msg = JSON.parse(event.data);
        } catch {
          return;
        }

        switch (msg.type) {
          case "room-joined":
            setRoomCode(msg.roomCode);
            setRole(msg.role);
            setError(null);
            // The receiver knows the sender is already in the room (they
            // created it), so we can consider the peer ready immediately.
            if (msg.role === "receiver") setPeerReady(true);
            break;

          case "peer-joined":
            // Sender learns the receiver has arrived.
            setPeerReady(true);
            break;

          case "peer-left":
            setPeerReady(false);
            break;

          case "error":
            setError(msg.message);
            break;

          // WebRTC signaling — forwarded to the WebRTC layer (Step 3).
          case "offer":
          case "answer":
          case "ice-candidate":
            onSignalRef.current?.(msg);
            break;
        }
      };

      // -----------------------------------------------------------------
      // Handle unexpected disconnects
      // -----------------------------------------------------------------
      ws.onclose = () => {
        wsRef.current = null;
        if (!intentionalCloseRef.current) {
          // The connection dropped without the user pressing Cancel.
          // Reset to landing with an error so they can retry.
          setRoomCode(null);
          setRole(null);
          setPeerReady(false);
          setError("Connection to server lost");
        }
      };
    });
  }, []);

  // -------------------------------------------------------------------
  // Sender — create a new room
  // -------------------------------------------------------------------
  const createRoom = useCallback(async () => {
    setError(null);
    try {
      const ws = await connectWs();
      ws.send(JSON.stringify({ type: "join-room" }));
    } catch (err) {
      setError(err.message);
    }
  }, [connectWs]);

  // -------------------------------------------------------------------
  // Receiver — join an existing room by 6-digit code
  // -------------------------------------------------------------------
  const joinRoom = useCallback(
    async (code) => {
      setError(null);
      try {
        const ws = await connectWs();
        ws.send(JSON.stringify({ type: "join-room", roomCode: code }));
      } catch (err) {
        setError(err.message);
      }
    },
    [connectWs],
  );

  // -------------------------------------------------------------------
  // Send a signaling message (offer / answer / ice-candidate).
  // Used by the WebRTC layer in Step 3.
  // -------------------------------------------------------------------
  const sendSignal = useCallback((msg) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  // -------------------------------------------------------------------
  // Tear down the connection and reset all state.
  // -------------------------------------------------------------------
  const disconnect = useCallback(() => {
    intentionalCloseRef.current = true;
    wsRef.current?.close();
    wsRef.current = null;
    setRoomCode(null);
    setRole(null);
    setPeerReady(false);
    setError(null);
  }, []);

  // Close on unmount.
  useEffect(() => {
    return () => {
      wsRef.current?.close();
    };
  }, []);

  return {
    roomCode,
    role,
    peerReady,
    error,
    createRoom,
    joinRoom,
    sendSignal,
    disconnect,
    onSignalRef,
  };
}
