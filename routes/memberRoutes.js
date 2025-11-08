const express = require("express");
const courseCtrl = require("../controllers/courseController");
const authCtrl = require("../controllers/authController");
const studentCtrl = require("../controllers/studentController");
const route = express.Router();

route.get("/courses", courseCtrl.listCourses);
route.get("/courses/:id", courseCtrl.getCourse);

route.use(authCtrl.protect, authCtrl.restrictTo("member"));
route.get("/learner", studentCtrl.getAllMyStudent);
route.get("/learner/:id", studentCtrl.getOneStudent);
route.patch("/learner/:id", studentCtrl.updateStudent);

route.post("/:id/goals", studentCtrl.updateLearningGoal);
route.get("/:id/roadmap", studentCtrl.getRoadmap);
route.post("/custom-schedule", studentCtrl.createCustomSchedule);
route.post("/enrollment", studentCtrl.createSeatHold);

module.exports = route;
