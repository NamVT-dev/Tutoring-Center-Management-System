const mongoose = require("mongoose");

const substituteRequestSchema = new mongoose.Schema(
  {
    teacher: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    session: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Session",
      required: true,
    },

    type: {
      type: String,
      enum: ["substitute"],
      default: "substitute",
    },

    newTeacher: { type: mongoose.Schema.Types.ObjectId, ref: "User" },

    reason: { type: String, required: true },

    status: {
      type: String,
      enum: [
        "pending_teacher",
        "pending_admin",
        "approved",
        "rejected",
        "cancelled",
      ],
      default: "pending_teacher",
    },

    teacherResponse: String,
    adminResponse: String,
    processedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("SubstituteRequest", substituteRequestSchema);
