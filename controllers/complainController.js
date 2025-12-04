const Complain = require("../models/complainModel");
const AppError = require("../utils/appError");
const catchAsync = require("../utils/catchAsync");
const factory = require("./handlerFactory");

exports.createOne = catchAsync(async (req, res) => {
  const complain = await Complain.create({
    user: req.user.id,
    ...req.body,
  });

  res.status(201).json({
    status: "success",
    data: {
      complain,
    },
  });
});

exports.getAll = factory.getAll(Complain);

exports.getOne = factory.getOne(Complain);

exports.updateOne = catchAsync(async (req, res, next) => {
  const doc = await Complain.findById(req.params.id);
  if (!doc) {
    return next(
      new AppError("Không tìm thấy dữ liệu với ID được cung cấp", 404)
    );
  }
  if (!doc.staffInCharge && req.user.role !== "admin")
    return next(new AppError("Khiếu nại đã có người phụ trách!", 403));
  doc.staffInCharge = doc.staffInCharge ? doc.staffInCharge : req.user.id;
  doc.status = req.body.status;
  await doc.save();

  res.status(200).json({
    status: "success",
    data: {
      data: doc,
    },
  });
});

exports.deleteOne = factory.deleteOne(Complain);
exports.getMyComplain = catchAsync(async (req, res) => {
  const complains = await Complain.find({
    user: req.user.id,
  });
  res.status(200).json({
    status: "success",
    complains,
  });
});
