const connectDb = require("../dbConfig");
const ChatAnalysis = require("../Models/ChatAnalysis");

async function getChatHistory(req, res) {
  try {
    const { userId } = req.query;

    await connectDb();

    const filter = userId ? { userId: String(userId) } : {};

    // Get sessions with full chat history, sorted by most recent first
    const sessions = await ChatAnalysis.find(filter)
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    return res.json(sessions);
  } catch (err) {
    console.error("Error in getChatHistory:", err);
    return res.status(500).json({ error: err.message || "Server error" });
  }
}

module.exports = {
  getChatHistory,
};

