import "dotenv/config";
import express from "express";
import http from "http";
import cors from "cors";
import { Server } from "socket.io";

import { connectDB } from "./config/db.js";
import roomRoutes from "./routes/roomRoutes.js";
import { initSocket } from "./socket/socketHandler.js";

const PORT = process.env.PORT || 5000;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "http://localhost:5173";

const app = express();
app.use(
  cors({
    origin: "*",
  })
);
app.use(express.json());

app.use("/api/rooms", roomRoutes);

app.get("/", (req, res) => res.send("Ephemeral Chat API is running"));

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: CLIENT_ORIGIN, methods: ["GET", "POST"] },
});

initSocket(io);

connectDB().then(() => {
  server.listen(PORT, () => console.log(`🚀 Server listening on port ${PORT}`));
});
