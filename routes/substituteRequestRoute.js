const express = require("express");
const SubstituteRequest = require("../controllers/substituteRequestController");
const authController = require("../controllers/authController");
const route = express.Router();

route.use(authController.protect);
route.get(
  "/requests/:id",
  authController.restrictTo("teacher", "admin", "staff"),
  SubstituteRequest.getOneRequest
);
route.delete(
  "/requests/:id",
  authController.restrictTo("teacher"),
  SubstituteRequest.cancelRequest
);
route.post(
  "/requests",
  authController.restrictTo("teacher"),
  SubstituteRequest.createSubstituteRequest
);
route.patch(
  "/requests/:id/respond",
  authController.restrictTo("teacher"),
  SubstituteRequest.respondToRequest
);
route.patch(
  "/requests/:id/process",
  authController.restrictTo("admin", "staff"),
  SubstituteRequest.adminProcessRequest
);
route.get(
  "/suggestions",
  authController.restrictTo("admin", "teacher", "staff"),
  SubstituteRequest.getSubstituteSuggestions
);
route.get(
  "/requests",
  authController.restrictTo("admin", "staff"),
  SubstituteRequest.getAllRequests
);
module.exports = route;
