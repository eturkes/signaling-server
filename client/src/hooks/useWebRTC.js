import { useState, useRef, useLayoutEffect } from "react";

// ---------------------------------------------------------------------------
// STUN servers for ICE candidate gathering.
// Public Google STUN servers are sufficient for most same-network and
// many cross-network scenarios. A TURN server would be needed to traverse
// symmetric NATs, but that is out of scope for this lightweight setup.
// ---------------------------------------------------------------------------
const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

// ---------------------------------------------------------------------------
// useWebRTC — creates and manages an RTCPeerConnection + RTCDataChannel
//
// Lifecycle:
//   1. When peerReady becomes true the hook creates a peer connection.
//   2. The SENDER creates a data channel and an SDP offer.
//   3. The RECEIVER waits for the offer via onSignalRef, then answers.
//   4. ICE candidates are exchanged until the connection is established.
//   5. When the data channel opens, dataChannelReady becomes true.
//   6. On cleanup (peer leaves / disconnect) everything is torn down.
//
// Why useLayoutEffect?
//   onSignalRef.current must be assigned synchronously after React commits
//   the render — before the browser yields to the event loop — so that no
//   WebSocket message (e.g. the sender's offer) can slip in before the
//   handler is in place.  useEffect is deferred until after paint, which
//   leaves a window for that race.
//
// Exposes:
//   rtcState         – RTCPeerConnection.connectionState mirror
//   dataChannelReady – true when the data channel is open on both sides
//   error            – human-readable error string or null
//   pcRef            – ref to the RTCPeerConnection (for advanced use)
//   dcRef            – ref to the RTCDataChannel (Step 4 sends data here)
// ---------------------------------------------------------------------------
export default function useWebRTC({ role, peerReady, sendSignal, onSignalRef }) {
  const pcRef = useRef(null);
  const dcRef = useRef(null);

  // Queue for ICE candidates that arrive before setRemoteDescription.
  const pendingCandidatesRef = useRef([]);

  const [rtcState, setRtcState] = useState("new");
  const [dataChannelReady, setDataChannelReady] = useState(false);
  const [error, setError] = useState(null);

  useLayoutEffect(() => {
    // Nothing to do until both peers are in the signaling room.
    if (!peerReady || !role) {
      setRtcState("new");
      setDataChannelReady(false);
      setError(null);
      return;
    }

    // -----------------------------------------------------------------
    // Fresh state for this connection attempt.
    // -----------------------------------------------------------------
    setRtcState("connecting");
    setError(null);
    pendingCandidatesRef.current = [];

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    pcRef.current = pc;

    // -----------------------------------------------------------------
    // Connection state tracking
    // -----------------------------------------------------------------
    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      setRtcState(state);
      if (state === "failed") {
        setError("Peer-to-peer connection failed. The other peer may be behind a restrictive NAT.");
      }
    };

    // -----------------------------------------------------------------
    // ICE candidate trickle — send each candidate to the remote peer
    // via the signaling server as soon as it is gathered.
    // -----------------------------------------------------------------
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        sendSignal({
          type: "ice-candidate",
          candidate: event.candidate.toJSON(),
        });
      }
    };

    // -----------------------------------------------------------------
    // Flush queued ICE candidates after the remote description is set.
    // -----------------------------------------------------------------
    async function flushPendingCandidates() {
      const queued = pendingCandidatesRef.current;
      pendingCandidatesRef.current = [];
      for (const candidate of queued) {
        try {
          await pc.addIceCandidate(candidate);
        } catch (err) {
          console.warn("Failed to add queued ICE candidate:", err);
        }
      }
    }

    // -----------------------------------------------------------------
    // Incoming signaling messages from the remote peer.
    //
    // This callback is invoked by useSignaling's WS onmessage handler
    // whenever an offer, answer, or ice-candidate message arrives.
    // -----------------------------------------------------------------
    onSignalRef.current = async (msg) => {
      try {
        switch (msg.type) {
          case "offer": {
            // Receiver: accept the offer, create and send an answer.
            await pc.setRemoteDescription({ type: "offer", sdp: msg.sdp });
            await flushPendingCandidates();
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            sendSignal({ type: "answer", sdp: answer.sdp });
            break;
          }

          case "answer": {
            // Sender: accept the answer.
            await pc.setRemoteDescription({ type: "answer", sdp: msg.sdp });
            await flushPendingCandidates();
            break;
          }

          case "ice-candidate": {
            if (!msg.candidate) break;
            // If the remote description hasn't been set yet, queue the
            // candidate — it will be flushed once setRemoteDescription
            // completes (after offer/answer processing).
            if (pc.remoteDescription) {
              await pc.addIceCandidate(msg.candidate);
            } else {
              pendingCandidatesRef.current.push(msg.candidate);
            }
            break;
          }
        }
      } catch (err) {
        console.error("[useWebRTC] signaling handler error:", err);
        setError(err.message);
      }
    };

    // -----------------------------------------------------------------
    // Role-specific setup
    // -----------------------------------------------------------------
    if (role === "sender") {
      // The sender creates the data channel BEFORE the offer so it is
      // included in the SDP.  The receiver will get it via ondatachannel.
      const dc = pc.createDataChannel("file-transfer", {
        ordered: true,
      });
      dcRef.current = dc;
      dc.binaryType = "arraybuffer";
      dc.onopen = () => setDataChannelReady(true);
      dc.onclose = () => setDataChannelReady(false);

      // Create and send the offer (async — runs after synchronous setup).
      (async () => {
        try {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          sendSignal({ type: "offer", sdp: offer.sdp });
        } catch (err) {
          console.error("[useWebRTC] failed to create offer:", err);
          setError(err.message);
        }
      })();
    } else {
      // Receiver: wait for the data channel to arrive.
      pc.ondatachannel = (event) => {
        const dc = event.channel;
        dcRef.current = dc;
        dc.binaryType = "arraybuffer";
        dc.onopen = () => setDataChannelReady(true);
        dc.onclose = () => setDataChannelReady(false);
      };
    }

    // -----------------------------------------------------------------
    // Cleanup — runs when deps change (peer leaves) or on unmount.
    // Null-out handlers first to prevent stale callbacks during close().
    // -----------------------------------------------------------------
    return () => {
      onSignalRef.current = null;

      if (dcRef.current) {
        dcRef.current.onopen = null;
        dcRef.current.onclose = null;
        dcRef.current.onerror = null;
        dcRef.current.onmessage = null;
        dcRef.current.close();
        dcRef.current = null;
      }

      pc.onicecandidate = null;
      pc.onconnectionstatechange = null;
      pc.ondatachannel = null;
      pc.close();
      pcRef.current = null;

      pendingCandidatesRef.current = [];
    };
  }, [peerReady, role, sendSignal, onSignalRef]);

  return { rtcState, dataChannelReady, error, pcRef, dcRef };
}
