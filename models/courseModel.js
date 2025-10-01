const mongoose = require("mongoose");

const courseSchema = new mongoose.Schema({
  name: {
    type: String,
    require: true,
    unique: true,
  },
  description: String,
  price: Number,
  category: {
    type: String,
  },
  level: {
    type: String,
  },
  session: Number,
  duration: Number,
  imageCover: String,
});
const Course = mongoose.model("Course", courseSchema, "courses");

module.exports = Course;
