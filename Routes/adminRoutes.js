const express = require("express");
const router = express.Router();
const requireAdmin = require("../Middleware/requireAdmin");
const adminController = require("../Controller/adminController");

router.get("/admin/users", requireAdmin, adminController.getAllUsers);

module.exports = router;

