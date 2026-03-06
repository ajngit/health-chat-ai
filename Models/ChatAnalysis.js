const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema(
  {
    role: { type: String, enum: ["user", "assistant", "system"], default: "user" },
    content: { type: String, required: true },
  },
  { _id: false }
);

const chatAnalysisSchema = new mongoose.Schema(
  {
    sessionId: { type: String, required: true, index: true }, // unique session identifier
    userId: { type: String, index: true }, // can be mapped from User.UserID or external ID
    userDetails: { type: Object },
    messages: { type: [messageSchema], required: true },
    aiResponse: { type: String },
    mentalState: { type: String },
    confidence: { type: Number },
    rawModelOutput: { type: Object },
  },
  { timestamps: true }
);

module.exports = mongoose.model("ChatAnalysis", chatAnalysisSchema);

