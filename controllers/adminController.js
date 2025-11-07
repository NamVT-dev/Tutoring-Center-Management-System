const catchAsync = require("../utils/catchAsync");
const AppError = require("../utils/appError");
const { buildPaginatedQuery } = require("../utils/queryHelper");
const { User, Teacher } = require("../models/userModel");
const { generateRandomPassword } = require("../utils/passwordUtils");
const Email = require("../utils/email");
const factory = require("./handlerFactory");

const getListTeacher = catchAsync(async (req, res) => {
  const { status, page = 1, limit = 10 } = req.query;
  const filters = { role: "teacher" };

  const { finalQuery, paginationOptions } = buildPaginatedQuery({
    query: req.query,
    filters,
    searchFields: ["username", "email", "level"],
    page,
    limit,
    select: "username email active profile.photo level avaiable",
    sort: "-createdAt",
  });

  const [total, teachers] = await Promise.all([
    Teacher.countDocuments(finalQuery),
    Teacher.find(finalQuery)
      .skip(paginationOptions.skip)
      .limit(paginationOptions.limit)
      .select(paginationOptions.select)
      .sort(paginationOptions.sort)
      .lean(),
  ]);
  res.status(200).json({
    status: "success",
    results: teachers.length,
    total,
    page: Number(page),
    totalPages: Math.ceil(total / limit),
    data: { teachers },
  });
});

const getTeacherDetail = catchAsync(async (req, res, next) => {
  const teacher = await Teacher.findOne({ _id: req.params.id })
    .select("-password -confirmPin -passwordResetToken -student")
    .lean();

  if (!teacher) return next(new AppError("Không tìm được giáo viên!", 404));

  res.status(200).json({
    status: "success",
    data: { teacher },
  });
});

const createTeacher = catchAsync(async (req, res) => {
  const { email, name, dob, phoneNumber, gender } = req.body;
  const tempPassword = generateRandomPassword();
  const teacher = await User.create({
    email,
    profile: {
      fullname: name,
      dob,
      phoneNumber,
      gender,
    },
    role: "teacher",
    password: tempPassword,
    passwordConfirm: tempPassword,
    active: true,
  });

  console.log(`Teacher created - Email: ${email},Password: ${tempPassword}`);

  try {
    await new Email(teacher, {
      email: teacher.email,
      password: tempPassword,
    }).sendTeacherWelcome();
  } catch (err) {
    console.error("Gửi email thất bại:", err);
  }

  const plainData = teacher.toObject();
  delete plainData.password;

  res.status(201).json({
    status: "success",
    data: plainData,
  });
});

const updateTeacher = factory.updateOne(Teacher);
const deleteTeacher = factory.deleteOne(Teacher);

module.exports = {
  getListTeacher,
  getTeacherDetail,
  createTeacher,
  updateTeacher,
  deleteTeacher,
};
