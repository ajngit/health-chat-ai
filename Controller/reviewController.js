const connectDb = require("../dbConfig");
const Review = require("../Models/Review");
const User = require("../Models/User");

async function saveReview(req, res) {
  try {
    const { userId, rating, reviewText } = req.body || {};

    if (!userId) {
      return res.status(400).json({ error: "userId is required" });
    }

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ error: "rating must be between 1 and 5" });
    }

    if (!reviewText || !String(reviewText).trim()) {
      return res.status(400).json({ error: "reviewText is required" });
    }

    await connectDb();

    const user = await User.findById(userId).select("UserName").lean();
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const review = await Review.findOneAndUpdate(
      { userId: String(userId) },
      {
        $set: {
          userId: String(userId),
          userName: user.UserName,
          rating: Number(rating),
          reviewText: String(reviewText).trim(),
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();

    return res.status(200).json(review);
  } catch (err) {
    console.error("Error in saveReview:", err);
    return res.status(500).json({ error: err.message || "Server error" });
  }
}

async function getMyReview(req, res) {
  try {
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({ error: "userId is required" });
    }

    await connectDb();

    const review = await Review.findOne({ userId: String(userId) }).lean();
    return res.json(review || null);
  } catch (err) {
    console.error("Error in getMyReview:", err);
    return res.status(500).json({ error: err.message || "Server error" });
  }
}

async function getAllReviews(req, res) {
  try {
    await connectDb();

    const reviews = await Review.find({})
      .sort({ updatedAt: -1 })
      .lean();

    return res.json(reviews);
  } catch (err) {
    console.error("Error in getAllReviews:", err);
    return res.status(500).json({ error: err.message || "Server error" });
  }
}

module.exports = {
  saveReview,
  getMyReview,
  getAllReviews,
};
