const Student = require("../models/studentModel");
const AppError = require("../utils/appError");
const catchAsync = require("../utils/catchAsync");

exports.getAllMyStudent = catchAsync(async (req, res) => {
  const user = await req.user.populate("student");
  res.status(200).json({
    status: "success",
    data: user.student,
  });
});

exports.getOneStudent = catchAsync(async (req, res, next) => {
  const studentId = req.params.id;
  if (!req.user.student.includes(studentId))
    return next(new AppError("Không tìm thấy học viên", 404));

  const student = await Student.findById(studentId);
  if (!student) return next(new AppError("Không tìm thấy học viên", 404));
  res.status(200).json({
    status: "success",
    data: student,
  });
});

exports.updateStudent = catchAsync(async (req, res, next) => {
  const studentId = req.params.id;
  if (!req.user.student.includes(studentId))
    return next(new AppError("Không tìm thấy học viên", 404));

  const student = await Student.findById(studentId);
  if (!student) return next(new AppError("Không tìm thấy học viên", 404));

  const filterObj = (obj, ...allowedFields) => {
    const newObj = {};
    Object.keys(obj).forEach((el) => {
      if (allowedFields.includes(el)) newObj[el] = obj[el];
    });
    return newObj;
  };

  const filteredBody = filterObj(req.body, "name", "dob");
  const updatedStudent = await Student.findByIdAndUpdate(
    studentId,
    filteredBody,
    {
      new: true,
      runValidators: true,
    }
  );

  res.status(200).json({
    status: "success",
    data: {
      student: updatedStudent,
    },
  });
});
