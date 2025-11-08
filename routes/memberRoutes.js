const express = require("express");
const courseCtrl = require("../controllers/courseController");
const studentCtrl = require("../controllers/studentController");
const auth = require("../controllers/authController");
const route = express.Router();

route.get("/courses",courseCtrl.listCourses);
route.get("/courses/:id", courseCtrl.getCourse);

route.post("/:id/goals",
    auth.protect,
    auth.restrictTo("member"), 
    studentCtrl.updateLearningGoal);
route.get("/:id/roadmap",
    auth.protect,
    auth.restrictTo("member"), 
    studentCtrl.getRoadmap);
route.post("/custom-schedule",
    auth.protect,
    auth.restrictTo("member"), 
    studentCtrl.createCustomSchedule);
route.post("/enrollment",
    auth.protect,
    auth.restrictTo("member"), 
    studentCtrl.createSeatHold);

module.exports = route;