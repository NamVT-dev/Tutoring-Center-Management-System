const mongoose = require("mongoose");

const complainSchema = new mongoose.Schema({
  student: {
    type: mongoose.Schema.ObjectId,
    ref: "User",
  },
  content: String,
});
const Complain = mongoose.model("Complain", complainSchema, "complains");

module.exports = Complain;
