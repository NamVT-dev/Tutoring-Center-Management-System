const express = require("express");
const courseCtrl = require("../controllers/courseController");
const authCtrl = require("../controllers/authController");
const studentCtrl = require("../controllers/studentController");
const teacherCtrl = require("../controllers/teacherController");
const route = express.Router();

route.get("/courses", courseCtrl.listCourses);
route.get("/courses/:id", courseCtrl.getCourse);
route.get("/highlight-teacher", teacherCtrl.getHighlightTeacher);
route.get("/teacher-profile/:id", teacherCtrl.getOneTeacher);

route.use(authCtrl.protect, authCtrl.restrictTo("member"));
route.get("/learner", studentCtrl.getAllMyStudent);
route.get("/learner/:id", studentCtrl.getOneStudent);
route.patch(
  "/learner/:id",
  authCtrl.uploadStudentPhoto,
  authCtrl.resizeUserPhoto,
  studentCtrl.updateStudent
);

route.post("/:id/goals", studentCtrl.updateLearningGoal);
route.get("/:id/roadmap", studentCtrl.getRoadmap);
route.post("/custom-schedule", studentCtrl.createCustomSchedule);
route.post("/enrollment", studentCtrl.createSeatHold);

route.get("/:id/classes", studentCtrl.getMyEnrolledClasses);
route.get("/:id/classes/:classId", studentCtrl.getStudentClassDetail);
route.get("/:id/schedule", studentCtrl.getMySchedule);

module.exports = route;
