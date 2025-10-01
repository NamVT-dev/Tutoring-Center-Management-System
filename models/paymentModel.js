const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema({
  student: {
    type: mongoose.Schema.ObjectId,
    ref: "User",
  },
  course: {
    type: mongoose.Schema.ObjectId,
    ref: "Course",
  },
  amount: Number,
  status: String,
});
const Payment = mongoose.model("Payment", paymentSchema, "payments");

module.exports = Payment;
