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
  testScore: {
    type: Number,
    default: 0,
  },
  registeredAt: {
    type: Date,
    default: Date.now(),
  },
  testResultAt: {
    type: Date,
  },
});

studentSchema.pre(/^find/, function (next) {
  this.populate("category");
  next();
});

const Student = mongoose.model("Student", studentSchema, "students");

module.exports = Student;
