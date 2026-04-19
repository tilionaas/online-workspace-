import { useRef, useEffect, useCallback } from 'react';
import { ROOMS } from '../constants/rooms.js';

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
];

/**
 * Manages all WebRTC peer connections for one local user.
 *
 * Peers are created / destroyed when the user changes rooms.
 * Connection topology: full mesh (every user in a room is connected to every other).
 *
 * Signaling is done via Socket.io:
 *   webrtc:offer   { targetId, offer }
 *   webrtc:answer  { targetId, answer }
 *   webrtc:ice     { targetId, candidate }
 *
 * Offer initiator is decided by string comparison of socket IDs
 * (lower ID = initiator). This prevents collisions when two peers
 * join simultaneously.
 */
export function useWebRTC({ socket, localStream, currentRoom }) {
  const peersRef        = useRef({});        // { [peerId]: RTCPeerConnection }
  const remoteStreamsRef = useRef({});        // { [peerId]: MediaStream }

  // Stable callbacks that WorkspaceApp passes in
  const onStreamAddedRef   = useRef(null);
  const onStreamRemovedRef = useRef(null);

  // ── helpers ──────────────────────────────────────────────────────────────

  const getTracksToAdd = useCallback((roomId) => {
    if (!localStream) return [];
    const room = ROOMS.find((r) => r.id === roomId);
    return localStream.getTracks().map((track) => {
      // Focus Room: force audio disabled
      if (room?.muteAudio && track.kind === 'audio') {
        track.enabled = false;
      } else {
        track.enabled = true;
      }
      return track;
    });
  }, [localStream]);

  const createPeer = useCallback((peerId, isInitiator, roomId) => {
    if (peersRef.current[peerId]) {
      peersRef.current[peerId].close();
    }

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    // ICE
    pc.onicecandidate = (e) => {
      if (e.candidate && socket) {
        socket.emit('webrtc:ice', { targetId: peerId, candidate: e.candidate });
      }
    };

    // Remote track
    pc.ontrack = (e) => {
      const [stream] = e.streams;
      if (stream) {
        remoteStreamsRef.current[peerId] = stream;
        onStreamAddedRef.current?.(peerId, stream);
      }
    };

    pc.onconnectionstatechange = () => {
      if (['disconnected', 'failed', 'closed'].includes(pc.connectionState)) {
        closePeer(peerId);
      }
    };

    // Add local tracks BEFORE setting onnegotiationneeded so the event
    // fires with tracks in place
    if (isInitiator) {
      pc.onnegotiationneeded = async () => {
        try {
          const offer = await pc.createOffer();
          if (pc.signalingState !== 'stable') return;
          await pc.setLocalDescription(offer);
          socket?.emit('webrtc:offer', { targetId: peerId, offer: pc.localDescription });
        } catch (err) {
          console.warn('[WebRTC] negotiation error', err);
        }
      };
    }

    // Add tracks (triggers onnegotiationneeded for the initiator)
    if (localStream) {
      getTracksToAdd(roomId).forEach((track) => {
        pc.addTrack(track, localStream);
      });
    }

    peersRef.current[peerId] = pc;
    return pc;
  }, [socket, localStream, getTracksToAdd]); // eslint-disable-line

  const closePeer = useCallback((peerId) => {
    const pc = peersRef.current[peerId];
    if (!pc) return;
    pc.ontrack = null;
    pc.onicecandidate = null;
    pc.onnegotiationneeded = null;
    pc.close();
    delete peersRef.current[peerId];
    delete remoteStreamsRef.current[peerId];
    onStreamRemovedRef.current?.(peerId);
  }, []);

  const closeAllPeers = useCallback(() => {
    Object.keys(peersRef.current).forEach(closePeer);
  }, [closePeer]);

  // ── Socket.io signaling listeners ────────────────────────────────────────

  useEffect(() => {
    if (!socket) return;

    // I just entered a room — server sends existing peer IDs
    const onRoomPeers = ({ roomId, peerIds }) => {
      if (!roomId) return;
      peerIds.forEach((peerId) => {
        // Lower socket.id → initiator (consistent across both sides)
        const isInitiator = socket.id < peerId;
        createPeer(peerId, isInitiator, roomId);
      });
    };

    // Someone else entered my current room
    const onUserEnteredRoom = ({ id: peerId }) => {
      if (!currentRoom) return;
      const isInitiator = socket.id < peerId;
      createPeer(peerId, isInitiator, currentRoom);
    };

    // Someone left any room — close peer if connected
    const onUserLeftRoom = ({ id: peerId }) => {
      closePeer(peerId);
    };

    // User disconnected entirely
    const onUserLeft = ({ id: peerId }) => {
      closePeer(peerId);
    };

    // Receive offer
    const onOffer = async ({ fromId, offer }) => {
      let pc = peersRef.current[fromId];
      if (!pc) {
        pc = createPeer(fromId, false, currentRoom);
      }
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('webrtc:answer', { targetId: fromId, answer: pc.localDescription });
      } catch (err) {
        console.warn('[WebRTC] offer handling error', err);
      }
    };

    // Receive answer
    const onAnswer = async ({ fromId, answer }) => {
      const pc = peersRef.current[fromId];
      if (!pc) return;
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
      } catch (err) {
        console.warn('[WebRTC] answer handling error', err);
      }
    };

    // Receive ICE candidate
    const onIce = async ({ fromId, candidate }) => {
      const pc = peersRef.current[fromId];
      if (!pc || !candidate) return;
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        // Benign during renegotiation
      }
    };

    socket.on('room:peers',         onRoomPeers);
    socket.on('user:entered-room',  onUserEnteredRoom);
    socket.on('user:left-room',     onUserLeftRoom);
    socket.on('user:left',          onUserLeft);
    socket.on('webrtc:offer',       onOffer);
    socket.on('webrtc:answer',      onAnswer);
    socket.on('webrtc:ice',         onIce);

    return () => {
      socket.off('room:peers',        onRoomPeers);
      socket.off('user:entered-room', onUserEnteredRoom);
      socket.off('user:left-room',    onUserLeftRoom);
      socket.off('user:left',         onUserLeft);
      socket.off('webrtc:offer',      onOffer);
      socket.off('webrtc:answer',     onAnswer);
      socket.off('webrtc:ice',        onIce);
    };
  }, [socket, currentRoom, createPeer, closePeer]);

  // Close all peers when room changes
  useEffect(() => {
    closeAllPeers();
  }, [currentRoom]); // eslint-disable-line

  // ── Public API ────────────────────────────────────────────────────────────

  const onStreamAdded = useCallback((cb) => {
    onStreamAddedRef.current = cb;
  }, []);

  const onStreamRemoved = useCallback((cb) => {
    onStreamRemovedRef.current = cb;
  }, []);

  return {
    onStreamAdded,
    onStreamRemoved,
    remoteStreams: remoteStreamsRef, // ref, not state — read in rAF
  };
}
