const mongoose = require("mongoose");

const enrollmentSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.ObjectId,
      ref: "Student",
      required: true,
      index: true,
    },
    course: {
      type: mongoose.Schema.ObjectId,
      ref: "Course",
    },
    class: {
      type: mongoose.Schema.ObjectId,
      ref: "Class",
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["hold", "confirmed", "canceled", "waitlisted", "refunded"],
      default: "hold",
      required: true,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    holdExpiresAt: {
      type: Date,
      index: true,
    },
    invoiceId: {
      type: String,
      index: true,
      sparse: true,
    },
    paidAt: {
      type: Date,
    },
    transferredFrom: {
      type: mongoose.Schema.ObjectId,
      ref: "Enrollment",
    },
    // Lý do hủy
    cancelReason: {
      type: String,
    },
  },
  { timestamps: true }
);

enrollmentSchema.index(
  { student: 1, class: 1, status: { $in: ["hold", "confirmed"] } },
  {
    unique: true,
    partialFilterExpression: { status: { $in: ["hold", "confirmed"] } },
  }
);
const Enrollment = mongoose.model(
  "Enrollment",
  enrollmentSchema,
  "enrollments"
);

module.exports = Enrollment;
