import { Router } from "express";
import { createRoom, getRoom } from "../controllers/roomController.js";

const router = Router();

router.post("/", createRoom);
router.get("/:id", getRoom);

export default router;
