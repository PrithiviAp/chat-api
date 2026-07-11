import Room from "../models/Room.js";

// In-memory bookkeeping of who is connected to which room.
// (Fine for a single-instance demo app; for multi-instance scaling you'd
// move this into Redis / a Socket.io adapter.)
const activeRooms = new Map();
// activeRooms.set(roomId, { creatorId: socket.id|null, partnerId: socket.id|null, expiryTimer })

const getOrInitRoom = (roomId) => {
  if (!activeRooms.has(roomId)) {
    activeRooms.set(roomId, { creatorId: null, partnerId: null, expiryTimer: null });
  }
  return activeRooms.get(roomId);
};

const scheduleExpiry = (io, roomId, expiresAt) => {
  const entry = getOrInitRoom(roomId);
  if (entry.expiryTimer) clearTimeout(entry.expiryTimer);

  const msLeft = new Date(expiresAt).getTime() - Date.now();

  entry.expiryTimer = setTimeout(async () => {
    io.to(roomId).emit("call-ended");
    io.to(roomId).emit("room-expired");
    io.socketsLeave(roomId);
    await teardownRoom(roomId);
  }, Math.max(msLeft, 0));
};

// Fully closes a room: clears its timer, removes it from memory, kicks any
// connected sockets out of the Socket.io room, and deletes the DB record —
// which is what actually frees the ID up for someone else to create again.
const teardownRoom = async (roomId) => {
  const entry = activeRooms.get(roomId);
  if (entry?.expiryTimer) clearTimeout(entry.expiryTimer);
  activeRooms.delete(roomId);

  try {
    await Room.deleteOne({ roomId });
  } catch (e) {
    console.error("Failed to delete room:", e.message);
  }
};

export const initSocket = (io) => {
  io.on("connection", (socket) => {
    console.log("🔌 Socket connected:", socket.id);

    // Creator's client calls this right after the REST createRoom() succeeds.
    socket.on("create-room", async ({ roomId }) => {
      const room = await Room.findOne({ roomId });
      if (!room) {
        return socket.emit("error-message", "Room does not exist or already expired.");
      }

      socket.join(roomId);
      socket.data.roomId = roomId;
      socket.data.role = "creator";

      const entry = getOrInitRoom(roomId);
      entry.creatorId = socket.id;

      scheduleExpiry(io, roomId, room.expiresAt);

      socket.emit("room-created", { roomId, expiresAt: room.expiresAt });

      // Tell ME the partner's current status (fixes "always shows offline"
      // when this is actually a reconnect/refresh, not a fresh room).
      socket.emit("partner-status", { online: Boolean(entry.partnerId) });
      // Tell the OTHER side (if connected) that I'm back online.
      socket.to(roomId).emit("partner-status", { online: true });
    });

    // Partner's client calls this after GET /api/rooms/:id confirms the ID is valid.
    socket.on("join-room", async ({ roomId }) => {
      const room = await Room.findOne({ roomId });
      if (!room || room.expiresAt.getTime() <= Date.now()) {
        return socket.emit("error-message", "This chat ID is invalid or has expired.");
      }

      socket.join(roomId);
      socket.data.roomId = roomId;
      socket.data.role = "partner";

      const entry = getOrInitRoom(roomId);
      entry.partnerId = socket.id;

      scheduleExpiry(io, roomId, room.expiresAt);

      socket.emit("room-joined", {
        roomId,
        expiresAt: room.expiresAt,
      });

      // Tell ME whether the creator is currently connected.
      socket.emit("partner-status", { online: Boolean(entry.creatorId) });
      // Tell the creator (and anyone else in the room) that I'm online.
      socket.to(roomId).emit("partner-status", { online: true });
    });

    socket.on("send-message", ({ roomId, message, sender, messageId }) => {
      if (!roomId || !message) return;
      const payload = {
        messageId, // used by clients to reconcile delivered/read ticks
        message,
        sender, // "me" is resolved client-side; server just tags actual role
        role: socket.data.role,
        timestamp: new Date().toISOString(),
      };
      socket.to(roomId).emit("receive-message", payload);
    });

    // Delivery/read receipts (single/double/blue tick) — simple relay,
    // sender's client matches these back to a message by messageId.
    socket.on("message-delivered", ({ roomId, messageId }) => {
      if (!roomId || !messageId) return;
      socket.to(roomId).emit("message-delivered", { messageId });
    });

    socket.on("message-read", ({ roomId, messageId }) => {
      if (!roomId || !messageId) return;
      socket.to(roomId).emit("message-read", { messageId });
    });

    // ---- Call signaling (audio or video — server never inspects SDP/ICE) ----
    socket.on("call-offer", ({ roomId, sdp, callType }) => {
      socket.to(roomId).emit("call-offer", { sdp, callType: callType || "audio" });
    });

    socket.on("call-answer", ({ roomId, sdp }) => {
      socket.to(roomId).emit("call-answer", { sdp });
    });

    socket.on("ice-candidate", ({ roomId, candidate }) => {
      socket.to(roomId).emit("ice-candidate", { candidate });
    });

    socket.on("call-decline", ({ roomId }) => {
      socket.to(roomId).emit("call-declined");
    });

    socket.on("call-end", ({ roomId }) => {
      socket.to(roomId).emit("call-ended");
    });

    // Fired when a user explicitly clicks "Exit". Unlike a raw disconnect,
    // this permanently closes the room right away — deletes it from the DB
    // (freeing the ID for reuse) and clears the other participant's screen.
    socket.on("leave-room", async ({ roomId }) => {
      if (!roomId) return;

      io.to(roomId).emit("call-ended"); // hang up any live call first
      io.to(roomId).emit("partner-left", {
        message: "Your partner has exited this chat.",
      });
      io.socketsLeave(roomId);
      await teardownRoom(roomId);

      console.log(`🚪 Room closed via explicit exit: ${roomId}`);
    });

    socket.on("typing", ({ roomId, isTyping }) => {
      socket.to(roomId).emit("partner-typing", { isTyping });
    });

    socket.on("disconnect", () => {
      const { roomId, role } = socket.data;
      if (!roomId) return;

      const entry = activeRooms.get(roomId);
      if (entry) {
        if (role === "creator") entry.creatorId = null;
        if (role === "partner") entry.partnerId = null;
      }

      socket.to(roomId).emit("partner-status", { online: false });
      socket.to(roomId).emit("call-ended"); // don't leave the other side stuck "in-call"
      console.log(`🔌 Socket disconnected: ${socket.id} (role: ${role}, room: ${roomId})`);
    });
  });
};
