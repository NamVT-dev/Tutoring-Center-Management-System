const express = require("express");
const authController = require("../controllers/authController");
const testController = require("../controllers/testController");
const {getCourseCategories} = require("../controllers/courseController");
const route = express.Router();

route.use(authController.protect);
route.post("/register-test", testController.registerTest);
route.get("/course-categories", getCourseCategories);
module.exports = route;
