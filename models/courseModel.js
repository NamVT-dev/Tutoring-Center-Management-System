const mongoose = require("mongoose");
const { embedText } = require("../utils/openAi");

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
  embedding: {
    type: [Number],
    select: false,
  },
});
courseSchema.index({ level: 1, category: 1 });

courseSchema.pre("save", async function (next) {
  if (
    !this.isModified("name") &&
    !this.isModified("category") &&
    !this.isModified("level") &&
    !this.isModified("price") &&
    !this.isModified("durationInMinutes")
  )
    return next();

  const textToEmbed = `Course: ${this.name}. Category: ${(await this.populate("category", "name")).category?.name}. Level: ${this.level}. Price: ${this.price}. Duration In Minutes: ${this.durationInMinutes}`;
  this.embedding = await embedText(textToEmbed);
  next();
});

const Course = mongoose.model("Course", courseSchema, "courses");

module.exports = Course;
