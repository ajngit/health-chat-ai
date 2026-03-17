const express = require("express");
const router = express.Router();
const chatController = require("../Controller/chatController");
const chatHistoryController = require("../Controller/chatHistoryController");

router.post("/chat/analyze", chatController.analyzeChat);
router.get("/chat/history", chatHistoryController.getChatHistory);
router.delete("/chat/history", chatHistoryController.clearChatHistory);
router.delete("/chat/history/:sessionId", chatHistoryController.deleteChatSession);
router.get("/chat/dashboard", chatHistoryController.getDashboardSummary);

module.exports = router;

