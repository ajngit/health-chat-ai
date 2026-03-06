const connectDb = require("../dbConfig");
const User = require("../Models/User");

module.exports = async function requireAdmin(req, res, next) {
  try {
    const userId = req.header("x-user-id");
    if (!userId) {
      return res.status(401).json({ error: "Missing x-user-id header" });
    }

    await connectDb();
    const user = await User.findById(userId).select("Role").lean();
    if (!user) {
      return res.status(401).json({ error: "Invalid user" });
    }
    if (user.Role !== 1) {
      return res.status(403).json({ error: "Admin access required" });
    }

    return next();
  } catch (err) {
    console.error("requireAdmin error:", err);
    return res.status(500).json({ error: "Server error" });
  }
};

