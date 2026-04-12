const mongoose = require("mongoose");

const reviewSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, unique: true, index: true },
    userName: { type: String, required: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    reviewText: { type: String, required: true, trim: true, maxlength: 1000 },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Review", reviewSchema);
