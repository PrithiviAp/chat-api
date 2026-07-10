import mongoose from "mongoose";

// A "Room" = a self-created chat ID.
// roomId IS the chat room name (creator shares this with their partner).
const roomSchema = new mongoose.Schema({
  roomId: {
    type: String,
    required: true,
    unique: true,
    minlength: 3,
    maxlength: 5,
    trim: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  expiresAt: {
    type: Date,
    required: true,
  },
  durationMinutes: {
    type: Number,
    required: true,
  },
});

// TTL index -> MongoDB automatically deletes the document once expiresAt passes.
// (Mongo's TTL monitor runs ~every 60s, so it's a background safety net —
// the actual real-time expiry/kick is handled by the in-memory timer in socketHandler.js)
roomSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model("Room", roomSchema);
