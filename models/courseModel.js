const mongoose = require("mongoose");
const { embedText } = require("../utils/embedText");

const courseSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
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
  session: { type: Number, required: true },
  durationInMinutes: { type: Number, required: true },
  imageCover: String,
  embedding: {
    type: [Number],
  },
});
courseSchema.index({ level: 1, category: 1 });

courseSchema.pre("save", async function (next) {
  if (
    !this.isModified(this.name) &&
    !this.isModified(this.category) &&
    !this.isModified(this.level) &&
    !this.isNew
  )
    return next();

  const textToEmbed = `Course: ${this.name}. Category: ${this.category}. Level: ${this.level}. Description: ${this.description}.`;
  this.embedding = await embedText(textToEmbed);
  next();
});
const Course = mongoose.model("Course", courseSchema, "courses");

module.exports = Course;
