const mongoose = require("mongoose");

const studentSchema = new mongoose.Schema({
  name: {
    type: String,
    reqired: true,
  },
  dob: Date,
  class: {
    type: [mongoose.Schema.ObjectId],
    ref: "Class",
  },
  level: String,
  category: {
    type: [mongoose.Schema.ObjectId],
    ref: "Category",
  },
  tested: {
    type: Boolean,
    default: false,
  },
});

const Student = mongoose.model("Student", studentSchema, "students");

module.exports = Student;
