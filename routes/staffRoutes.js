const express = require("express");
const adminController = require("../controllers/adminController");
const authController = require("../controllers/authController");
const paymentController = require("../controllers/paymentController");
const classController = require("../controllers/classController");
const testController = require("../controllers/testController");
const teacherController = require("../controllers/teacherController");
const customController = require("../controllers/customScheduleController");

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
route.post("/class/session", classController.createManySession);
route.patch("/class/:id", classController.updateClass);
route.patch("/class/:id/add-student", classController.addStudent);
route.delete("/class/:id", classController.deleteClass);

//test-score
route.get("/export-score", testController.exportScore);

//update-teacher-skills
route.patch("/teacher/:id/skills", teacherController.updateTeacherSkills);

//custom-request
route.get("/custom-requests/summary", customController.getCustomRequestSummary);
route.get("/custom-requests", customController.getAllCustomRequests);
route.get("/custom-requests/:id", customController.getOneCustomRequest);
route.patch("/custom-requests/:id", customController.updateCustomRequest);
route.delete("/custom-requests/:id", customController.deleteOneCustomRequest);

module.exports = route;
