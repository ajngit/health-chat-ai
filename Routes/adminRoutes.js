const express = require("express");
const router = express.Router();
const requireAdmin = require("../Middleware/requireAdmin");
const adminController = require("../Controller/adminController");
const reviewController = require("../Controller/reviewController");

router.get("/admin/users", requireAdmin, adminController.getAllUsers);
router.get("/admin/reviews", requireAdmin, reviewController.getAllReviews);

module.exports = router;

