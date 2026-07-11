import mongoose from "mongoose";

export const connectDB = async () => {
  try {
    await mongoose.connect("mongodb+srv://prithivi860_db_user:RKTdnDxCgKGiM4j2@chat-cluster-1.jbuzyje.mongodb.net/chat-app");
    console.log("✅ MongoDB connected");
  } catch (err) {
    console.error("❌ MongoDB connection error:", err.message);
    process.exit(1);
  }
};