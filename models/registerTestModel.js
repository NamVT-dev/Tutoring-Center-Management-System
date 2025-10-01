const mongoose = require("mongoose");

const registerTestSchema = new mongoose.Schema({
  student: {
    type: mongoose.Schema.ObjectId,
    ref: "User",
  },
  type: String,
  course: {
    type: mongoose.Schema.ObjectId,
    ref: "Course",
  },
  testDate: Date,
});
const RegisterTest = mongoose.model(
  "RegisterTest",
  registerTestSchema,
  "registertests"
);

module.exports = RegisterTest;
