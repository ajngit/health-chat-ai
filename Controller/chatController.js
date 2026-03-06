const chatService = require("../Services/chatService");

async function analyzeChat(req, res) {
  try {
    const { sessionId, userId, userDetails, messages } = req.body || {};

    if (!sessionId) {
      return res
        .status(400)
        .json({ error: "sessionId is required" });
    }

    if (!Array.isArray(messages) || messages.length === 0) {
      return res
        .status(400)
        .json({ error: "messages must be a non-empty array" });
    }

    const result = await chatService.analyzeChat({
      sessionId,
      userId,
      userDetails,
      messages,
    });

    return res.status(200).json(result);
  } catch (err) {
    console.error("Error in analyzeChat:", err);
    return res.status(500).json({ error: err.message || "Server error" });
  }
}

module.exports = {
  analyzeChat,
};

