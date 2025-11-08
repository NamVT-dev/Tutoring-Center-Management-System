const mongoose = require("mongoose");

const learningGoalSchema = new mongoose.Schema(
  {
    category: {
      type: mongoose.Schema.ObjectId,
      ref: "Category",
      required: true,
    },
    targetScore: { type: String, required: true },
    deadline: { type: Date, required: true },
    constraints: {
      days: { type: [Number], default: [] },
      shifts: { type: [String], default: [] },
    },
  },
  { _id: false }
);
const studentSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    name: {
      type: String,
      reqired: true,
    },
    dob: Date,
    gender: {
      type: String,
      enum: ["male", "female"],
      default: "male",
    },
    photo: String,
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
    enrolled: {
      type: Boolean,
      default: false,
    },
    learningGoal: learningGoalSchema,
  },
  { timestamps: true }
);
studentSchema.pre("save", function (next) {
  // Chỉ chạy nếu trường mới có thay đổi
  if (!this.isModified("learningGoal")) {
    return next();
  }

  try {
    // 1. Đồng bộ từ Learning Goal
    if (this.isModified("learningGoal") && this.learningGoal?.category) {
      this.category = [this.learningGoal.category];
    }
    next();
  } catch (err) {
    next(err);
  }
});
studentSchema.pre(/^find/, function (next) {
  this.populate("category").populate("learningGoal.category");
  next();
});

const Student = mongoose.model("Student", studentSchema, "students");

module.exports = Student;
