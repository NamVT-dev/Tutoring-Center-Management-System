const { User, Staff } = require("../models/userModel");
const AppError = require("../utils/appError");
const catchAsync = require("../utils/catchAsync");
const Email = require("../utils/email");
const { generateRandomPassword } = require("../utils/passwordUtils");
const factory = require("./handlerFactory");

exports.createStaff = catchAsync(async (req, res) => {
  const { email, name, dob, phoneNumber, gender } = req.body;
  const tempPassword = generateRandomPassword();
  const staff = await User.create({
    email,
    profile: {
      fullname: name,
      dob,
      phoneNumber,
      gender,
    },
    role: "staff",
    password: tempPassword,
    passwordConfirm: tempPassword,
    active: true,
  });

  console.log(`Staff created - Email: ${email},Password: ${tempPassword}`);

  try {
    await new Email(staff, {
      email: staff.email,
      password: tempPassword,
    }).sendStaffWelcome();
  } catch (err) {
    console.error("Gửi email thất bại:", err);
  }

  const plainData = staff.toObject();
  delete plainData.password;

  res.status(201).json({
    status: "success",
    data: plainData,
  });
});

exports.deleteStaff = catchAsync(async (req, res, next) => {
  const staff = Staff.findById(req.params.id);
  if (!staff) return next(new AppError("Không tìm thấy staff", 404));
  await Staff.findByIdAndDelete(req.params.id);
  res.status(200).json({
    status: "success",
    message: "Staff đã được xóa!",
  });
});

exports.getAllStaff = factory.getAll(Staff, [
  "profile.fullname",
  "email",
  "profile.phoneNumber",
]);
exports.getOneStaff = factory.getOne(Staff);
