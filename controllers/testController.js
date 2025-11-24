const catchAsync = require("../utils/catchAsync");
const path = require("path");
const AppError = require("../utils/appError");
const { Member } = require("../models/userModel");
const Category = require("../models/categoryModel");
const Student = require("../models/studentModel");
const Email = require("../utils/email");
const createCsvWriter = require("csv-writer").createObjectCsvWriter;

const csvFilePath = path.join(__dirname, "..", "public", "results.csv");

exports.registerTest = catchAsync(async (req, res, next) => {
  const { name, dob, gender, categoryId } = req.body;
  if (!name || !dob) {
    return next(new AppError("Thiếu thông tin cần thiết", 400));
  }

  const category = await Category.findById(categoryId);
  if (!category) return next(new AppError("Không tìm thấy category", 400));

  const user = await Member.findById(req.user.id);
  if (user.student.length >= 3)
    return next(new AppError("Tài khoản đã tạo tối đa học viên", 400));

  const student = await Student.create({
    user: req.user.id,
    name,
    dob,
    gender,
    category: categoryId,
    tested: false,
  });

  user.student.push(student.id);

  user.save({ validateBeforeSave: false });
  try {
    await new Email(req.user, {
      studentId: student.id,
      categoryName: category.name,
      dob,
      linkTest:
        "https://docs.google.com/forms/d/e/1FAIpQLSeCyUtrGQUM6C6Y18wGqnrDR85fWmDl93RoDyBHJ9vw9beLxQ/viewform?usp=pp_url&entry.778611321=" +
        student.id,
    }).sendTestRegisterSuccess();
    /*eslint-disable-next-line*/
  } catch (error) {
    console.log(error);
    return next(new AppError("Có lỗi khi gửi email. Hãy thử lại sau!"), 500);
  }

  res
    .status(201)
    .json({ message: "Đăng ký thành công! Hãy kiểm tra email của bạn." });
});

exports.exportScore = catchAsync(async (req, res) => {
  res.download(csvFilePath, "score-template.csv");
});
