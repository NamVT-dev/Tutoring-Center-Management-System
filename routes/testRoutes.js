const express = require("express");
const authController = require("../controllers/authController");
const testController = require("../controllers/testController");
const { getCourseCategories } = require("../controllers/courseController");
const route = express.Router();

route.get("/course-categories", getCourseCategories);

route.use(authController.protect);
route.use(authController.restrictTo("member"));
route.post("/register-test", testController.registerTest);

module.exports = route;
