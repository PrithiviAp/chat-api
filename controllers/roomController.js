import Room from "../models/Room.js";

const ALLOWED_DURATIONS = [10, 30, 60]; // minutes

const ID_REGEX = /^.{3,5}$/; // 3-5 of ANY character (letters/nums/case/special)

// POST /api/rooms  { roomId, durationMinutes }
export const createRoom = async (req, res) => {
  try {
    const { roomId, durationMinutes } = req.body;

    if (!roomId || !ID_REGEX.test(roomId)) {
      return res.status(400).json({ message: "ID must be 3-5 characters." });
    }

    if (!ALLOWED_DURATIONS.includes(Number(durationMinutes))) {
      return res.status(400).json({ message: "Invalid duration. Choose 10, 30 or 60 minutes." });
    }

    const existing = await Room.findOne({ roomId });
    if (existing) {
      return res.status(409).json({ message: "This ID is already taken. Try another one." });
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + durationMinutes * 60 * 1000);

    const room = await Room.create({
      roomId,
      expiresAt,
      durationMinutes,
    });

    return res.status(201).json({
      roomId: room.roomId,
      expiresAt: room.expiresAt,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error while creating room." });
  }
};

// GET /api/rooms/:id  -> used by "join with partner's ID" screen to validate before joining
export const getRoom = async (req, res) => {
  try {
    const { id } = req.params;
    const room = await Room.findOne({ roomId: id });

    if (!room) {
      return res.status(404).json({ message: "No active chat found with this ID." });
    }

    if (room.expiresAt.getTime() <= Date.now()) {
      // Not yet swept by Mongo TTL job — treat as expired anyway.
      return res.status(410).json({ message: "This chat ID has expired." });
    }

    return res.status(200).json({
      roomId: room.roomId,
      expiresAt: room.expiresAt,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error while fetching room." });
  }
};
