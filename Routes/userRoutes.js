const express = require("express");
const router = express.Router();
const userController = require("../Controller/userController");
const reviewController = require("../Controller/reviewController");

router.get("/user", userController.getUser);

router.post("/register", userController.saveUser);

router.post("/login", userController.AuthenticateUser);

router.get("/getuserdetails", userController.GetUserDetails);

router.delete("/deleteuser", userController.DeleteUser);

router.post("/reviews", reviewController.saveReview);
router.get("/reviews/my", reviewController.getMyReview);

module.exports = router;
