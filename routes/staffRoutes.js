const express = require("express");
const adminController = require("../controllers/adminController");
const authController = require("../controllers/authController");
const paymentController = require("../controllers/paymentController");
const classController = require("../controllers/classController");
const testController = require("../controllers/testController");
const teacherController = require("../controllers/teacherController");

const route = express.Router();

route.use(authController.protect, authController.restrictTo("admin", "staff"));

//account
route.get(
  "/account",
  adminController.accountFilterForStaff,
  adminController.getAllUserAccount
);

route.get("/account/:id", adminController.getOneUserAccount);

//transactions
route.get("/transaction", paymentController.getAllPayment);
route.get("/transaction/:id", paymentController.getOne);

//class
route.post("/class", classController.createClass);
route.patch("/class/:id", classController.updateClass);
route.delete("/class/:id", classController.deleteClass);

//test-score
route.get("/export-score", testController.exportScore);

//update-teacher-skills
route.patch("/teacher/:id/skills", teacherController.updateTeacherSkills);

module.exports = route;
