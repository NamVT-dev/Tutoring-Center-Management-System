const Notification = require("../models/notificationModel");
const AppError = require("../utils/appError");
const catchAsync = require("../utils/catchAsync");
const factory = require("./handlerFactory");

exports.getAllNotifications = catchAsync(async (req, res) => {
  const user = req.user;
  const notifications = await Notification.find({
    $or: [
      {
        recipientId: user.id,
      },
      {
        recipientGroup: user.role,
      },
    ],
  });

  res.status(200).json({
    status: "success",
    data: notifications,
  });
});

exports.getOne = catchAsync(async (req, res, next) => {
  const notification = await Notification.findById(req.params.id);
  if (!notification || !notification.recipientGroup === req.user.role)
    return next(new AppError("Không tìm thấy thông báo", 404));
  res.status(200).json({
    status: "success",
    data: notification,
  });
});

exports.createOne = factory.createOne(Notification);
exports.updateOne = factory.updateOne(Notification);
exports.deleteOne = factory.deleteOne(Notification);
