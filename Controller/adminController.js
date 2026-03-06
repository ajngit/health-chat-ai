const connectDb = require("../dbConfig");
const User = require("../Models/User");

async function getAllUsers(req, res) {
  try {
    await connectDb();

    const users = await User.find({})
      .select("-Password")
      .sort({ createdAt: -1 })
      .lean();

    const mapped = users.map((u) => ({
      ...u,
      UserID: u._id.toString(),
    }));

    return res.json(mapped);
  } catch (err) {
    console.error("Error in getAllUsers:", err);
    return res.status(500).json({ error: err.message || "Server error" });
  }
}

module.exports = {
  getAllUsers,
};

