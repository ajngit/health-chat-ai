const express = require("express");
const router = express.Router();
const chatController = require("../Controller/chatController");
const chatHistoryController = require("../Controller/chatHistoryController");

router.post("/chat/analyze", chatController.analyzeChat);
router.get("/chat/history", chatHistoryController.getChatHistory);

module.exports = router;

