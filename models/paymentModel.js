const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
  amount: { type: Number, required: true },
  currency: { type: String, default: "VND" },
  method: {
    type: String,
    enum: ["card", "bank_transfer", "paypal", "apple_pay", "stripe", "other"],
    default: "bank_transfer",
  },
  provider: { type: String },
  providerPaymentId: { type: String, index: true }, // id bên provider
  status: {
    type: String,
    enum: [
      "pending",
      "processing",
      "succeeded",
      "failed",
      "refunded",
      "cancelled",
    ],
    default: "pending",
    index: true,
  },
  description: { type: String },
  invoiceId: { type: String },
  createdAt: { type: Date, default: Date.now },
});
paymentSchema.index({ userId: 1, createdAt: -1 });

paymentSchema.pre(/^find/, function (next) {
  this.populate("user");
  next();
});

const Payment = mongoose.model("Payment", paymentSchema, "payments");

module.exports = Payment;
