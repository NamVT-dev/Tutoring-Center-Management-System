const Payment = require("../models/paymentModel");
const AppError = require("../utils/appError");
const catchAsync = require("../utils/catchAsync");

exports.getAllPayments = catchAsync(async (req, res) => {
  const payments = await Payment.find({
    userId: req.user.id,
  });

  res.status(200).json({
    status: "success",
    data: payments,
  });
});

exports.getOne = catchAsync(async (req, res, next) => {
  const payment = await Payment.findById(req.params.id);
  if (!payment || !payment.userId === req.user.id)
    return next(new AppError("Không tìm thấy thanh toán", 404));
  res.status(200).json({
    status: "success",
    data: payment,
  });
});
