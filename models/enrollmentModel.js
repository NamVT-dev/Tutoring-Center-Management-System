const mongoose = require("mongoose");

const enrollmentSchema = new mongoose.Schema({
  student: {
    type: mongoose.Schema.ObjectId,
    ref: "User",
  },
  course: {
    type: mongoose.Schema.ObjectId,
    ref: "Course",
  },
  class: {
    type: mongoose.Schema.ObjectId,
    ref: "Class",
    required: true,
    index: true,
  },
  status: { type: String, default: "active" },
});
const Enrollment = mongoose.model(
  "Enrollment",
  enrollmentSchema,
  "Enrollments"
);

module.exports = Enrollment;
