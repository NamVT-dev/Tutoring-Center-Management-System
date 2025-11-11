const express = require("express");
const teacherController = require("../controllers/teacherController");
const authCtrl = require("../controllers/authController");
const { getCourseCategories } = require("../controllers/courseController");
const { getConfig } = require("../controllers/centerController");
const route = express.Router();

//auth for teacher
route.use(authCtrl.protect);
route.use(authCtrl.restrictTo("teacher"));

route.get("/categories", getCourseCategories);
route.get("/shift", getConfig);
route.patch("/register-shift", teacherController.registerShiftAvailability);
route.get("/my-class",teacherController.getMyClasses);
route.get("/my-class/:id",teacherController.getStudentClassDetail)
route.get("/my-schedule",teacherController.getMySchedule)
module.exports = route;
