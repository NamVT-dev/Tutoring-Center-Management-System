const Complain = require("../models/complainModel");
const catchAsync = require("../utils/catchAsync");
const factory = require("./handlerFactory");

exports.createOne = catchAsync(async (req, res, next) => {
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
exports.updateOne = factory.updateOne(Complain);
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
