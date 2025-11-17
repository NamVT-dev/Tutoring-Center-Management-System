const mongoose = require("mongoose");

const complainSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.ObjectId,
      ref: "User",
    },
    content: String,
    status: {
      type: String,
      enum: [
        "Pending",
        "Received", 
        "In_Progress", 
        "Resolved", 
        "Closed", 
        "Rejected",
      ],
      default: "Pending",
      index: true,
    },
  },
  { timestamps: true }
);
const Complain = mongoose.model("Complain", complainSchema, "complains");

module.exports = Complain;
