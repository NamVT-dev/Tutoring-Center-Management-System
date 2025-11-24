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
  },
  { timestamps: true }
);
complainSchema.pre(/^find/, function (next) {
  this.populate("user");
  next();
});
const Complain = mongoose.model("Complain", complainSchema, "complains");

module.exports = Complain;
