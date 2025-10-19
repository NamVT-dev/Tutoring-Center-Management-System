const mongoose = require("mongoose");

const courseSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
  },
  description: String,
  price: Number,
  category: {
    type: mongoose.Schema.ObjectId,
    ref: "Category",
  },
  level: {
    type: String,
  },
  session: { type: Number, required: true },
  durationInMinutes: { type: Number, required: true },
  imageCover: String,
});
courseSchema.index({ level: 1, category: 1 });
const Course = mongoose.model("Course", courseSchema, "courses");

module.exports = Course;
