import "dotenv/config";
import express from "express";
import http from "http";
import cors from "cors";
import { Server } from "socket.io";

import { connectDB } from "./config/db.js";
import roomRoutes from "./routes/roomRoutes.js";
import { initSocket } from "./socket/socketHandler.js";

const PORT = process.env.PORT || 5000;

const app = express();

// Allow all origins
app.use(cors());
app.use(express.json());

app.use("/api/rooms", roomRoutes);

app.get("/", (req, res) => res.send("Ephemeral Chat API is running"));

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

initSocket(io);

connectDB().then(() => {
  server.listen(PORT, () =>
    console.log(`🚀 Server listening on port ${PORT}`)
  );
});
