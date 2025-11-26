const mongoose = require("mongoose");

const complainSchema = new mongoose.Schema(
  {
    user: {
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
    staffInCharge: {
      type: mongoose.Schema.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true }
);
complainSchema.pre(/^find/, function (next) {
  this.populate("user staffInCharge");
  next();
});
const Complain = mongoose.model("Complain", complainSchema, "complains");

module.exports = Complain;
