const mongoose = require("mongoose");

const classSchema = new mongoose.Schema({
  name: {
    type: String,
    require: true,
    unique: true,
  },
  course: {
    type: mongoose.Schema.ObjectId,
    ref: "Course",
  },
  progress: String,
  schedules: [Date],
  start: String,
  end: String,
  minStudent: Number,
  maxStudent: Number,
  learningMaterial: String,
});
const Class = mongoose.model("Class", classSchema, "classes");

module.exports = Class;
