const express = require("express");
const adminController = require("../controllers/adminController");
const roomctrl = require("../controllers/roomController");
const courseCtrl = require("../controllers/courseController");
const centerCtrl = require("../controllers/centerController");
const authCtrl = require("../controllers/authController");
const categoryCtrl = require("../controllers/categoryController");
const classCtrl = require("../controllers/classController");
const staffCtrl = require("../controllers/staffController");
const dashboardCtrl = require("../controllers/dashboardController");
const sessionCtrl = require("../controllers/sessionController");
const route = express.Router();

//auth for admin
route.use(authCtrl.protect);
route.use(authCtrl.restrictTo("admin"));
//quan ly giao vien
route.get("/teachers", adminController.getListTeacher);
route.post("/teachers", adminController.createTeacher);
route.get("/teachers/:id", adminController.getTeacherDetail);
route.patch(
  "/teachers/:id",
  authCtrl.uploadUserPhoto,
  authCtrl.resizeUserPhoto,
  adminController.updateTeacher
);
route.delete("/teachers/:id", adminController.deleteTeacher);
//quan ly room
route.post("/rooms", roomctrl.createRoom);
route.patch("/rooms/update/:id", roomctrl.updateRoom);
route.get("/rooms", roomctrl.listRoom);
route.delete("/rooms/:id/delete", roomctrl.deleteRoom);
//quan ly course
route.post(
  "/courses",
  courseCtrl.uploadCourseImage,
  courseCtrl.processCourseImage,
  courseCtrl.createCourse
);
route.patch(
  "/courses/update/:id",
  courseCtrl.uploadCourseImage,
  courseCtrl.processCourseImage,
  courseCtrl.updateCourse
);
route.get("/courses", courseCtrl.listCourses);
route.delete("/courses/:id/delete", courseCtrl.deleteCourse);
route.get("/courses/:id", courseCtrl.getCourse);
//quan ly center
route.get("/center/config", centerCtrl.getConfig);
route.patch("/center/config", centerCtrl.updateConfig);
route.patch("/center/isOpen", centerCtrl.availabilityRegistration);
//quan ly category
route.post("/categories", categoryCtrl.createCategory);
//quan ly class
route.get("/classes", classCtrl.listClasses);
route.get("/classes/:id", classCtrl.getClassDetail);
route.patch("/classes/:id/preview", classCtrl.previewChangeTeacher);
route.patch("/classes/:id/apply", classCtrl.applyChangeTeacher);
route.patch("/classes/:id/cancel", classCtrl.cancelClass);
//quan ly staff
route.get("/staff", staffCtrl.getAllStaff);
route.get("/staff/:id", staffCtrl.getOneStaff);
route.post("/staff", staffCtrl.createStaff);
route.delete("/staff/:id", staffCtrl.deleteStaff);

//dashboard
route.get("/student-demand", dashboardCtrl.getStudentDemandReport);
route.get("/dashboard", dashboardCtrl.getDashboardOverview);
route.get("/reports/revenue", dashboardCtrl.getRevenueReport);
//quan ly session
route.patch("/session/:id", sessionCtrl.updateSession);

route.patch("/deactive-account/:id", authCtrl.deactiveAccount);

module.exports = route;
