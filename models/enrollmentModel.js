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
  status: String,
});
const Enrollment = mongoose.model(
  "Enrollment",
  enrollmentSchema,
  "Enrollments"
);

module.exports = Enrollment;
