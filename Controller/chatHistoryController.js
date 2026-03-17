const connectDb = require("../dbConfig");
const ChatAnalysis = require("../Models/ChatAnalysis");

function buildFilter(userId) {
  return userId ? { userId: String(userId) } : {};
}

async function getChatHistory(req, res) {
  try {
    const { userId } = req.query;

    await connectDb();

    const filter = buildFilter(userId);

    // Get sessions with full chat history, sorted by most recent first
    const sessions = await ChatAnalysis.find(filter)
      .sort({ updatedAt: -1 })
      .limit(50)
      .lean();

    return res.json(sessions);
  } catch (err) {
    console.error("Error in getChatHistory:", err);
    return res.status(500).json({ error: err.message || "Server error" });
  }
}

async function deleteChatSession(req, res) {
  try {
    const { sessionId } = req.params;
    const { userId } = req.query;

    if (!sessionId) {
      return res.status(400).json({ error: "sessionId is required" });
    }

    await connectDb();

    const deleted = await ChatAnalysis.findOneAndDelete({
      sessionId: String(sessionId),
      ...buildFilter(userId),
    });

    if (!deleted) {
      return res.status(404).json({ error: "Chat session not found" });
    }

    return res.json({ success: true, sessionId: deleted.sessionId });
  } catch (err) {
    console.error("Error in deleteChatSession:", err);
    return res.status(500).json({ error: err.message || "Server error" });
  }
}

async function clearChatHistory(req, res) {
  try {
    const { userId } = req.query;

    await connectDb();

    const filter = buildFilter(userId);

    if (!filter.userId) {
      return res.status(400).json({ error: "userId is required" });
    }

    const result = await ChatAnalysis.deleteMany(filter);

    return res.json({
      success: true,
      deletedCount: result.deletedCount || 0,
    });
  } catch (err) {
    console.error("Error in clearChatHistory:", err);
    return res.status(500).json({ error: err.message || "Server error" });
  }
}

async function getDashboardSummary(req, res) {
  try {
    const { userId } = req.query;

    await connectDb();

    const filter = buildFilter(userId);
    const sessions = await ChatAnalysis.find(filter).lean();

    const emotionTotals = {};
    const mentalStateTotals = {};
    const indexTotals = {
      distressIndex: 0,
      supportNeedIndex: 0,
      resilienceIndex: 0,
      riskIndex: 0,
    };

    for (const session of sessions) {
      if (session.mentalState) {
        mentalStateTotals[session.mentalState] =
          (mentalStateTotals[session.mentalState] || 0) + 1;
      }

      const emotions = session.emotionAnalysis?.emotions || [];
      for (const emotion of emotions) {
        emotionTotals[emotion.emotion] = {
          total: (emotionTotals[emotion.emotion]?.total || 0) + (emotion.score || 0),
          count: (emotionTotals[emotion.emotion]?.count || 0) + 1,
        };
      }

      indexTotals.distressIndex += session.indexes?.distressIndex || 0;
      indexTotals.supportNeedIndex += session.indexes?.supportNeedIndex || 0;
      indexTotals.resilienceIndex += session.indexes?.resilienceIndex || 0;
      indexTotals.riskIndex += session.indexes?.riskIndex || 0;
    }

    const sessionCount = sessions.length || 1;
    const overallEmotionScores = Object.entries(emotionTotals)
      .map(([emotion, value]) => ({
        emotion,
        score: Math.round(value.total / value.count),
      }))
      .sort((a, b) => b.score - a.score);

    const averageIndexes = {
      distressIndex: Math.round(indexTotals.distressIndex / sessionCount),
      supportNeedIndex: Math.round(indexTotals.supportNeedIndex / sessionCount),
      resilienceIndex: Math.round(indexTotals.resilienceIndex / sessionCount),
      riskIndex: Math.round(indexTotals.riskIndex / sessionCount),
    };

    return res.json({
      totalSessions: sessions.length,
      mentalStateDistribution: mentalStateTotals,
      overallEmotionScores,
      averageIndexes,
    });
  } catch (err) {
    console.error("Error in getDashboardSummary:", err);
    return res.status(500).json({ error: err.message || "Server error" });
  }
}

module.exports = {
  getChatHistory,
  deleteChatSession,
  clearChatHistory,
  getDashboardSummary,
};

