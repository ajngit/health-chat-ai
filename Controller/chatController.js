const chatService = require("../Services/chatService");

async function analyzeChat(req, res) {
  try {
    const { userId, userDetails, messages } = req.body || {};

    if (!Array.isArray(messages) || messages.length === 0) {
      return res
        .status(400)
        .json({ error: "messages must be a non-empty array" });
    }

    const result = await chatService.analyzeChat({
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

