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
  const { name, dob, categoryId } = req.body;
  if (!name || !dob) {
    return next(new AppError("Thiếu thông tin cần thiết", 400));
  }

  const category = await Category.findById(categoryId);
  if (!category) return next(new AppError("Không tìm thấy category", 400));

  const student = await Student.create({
    name,
    dob,
    category: categoryId,
    tested: false,
  });
  const user = await Member.findById(req.user.id);
  user.student.push(student.id);

  user.save({ validateBeforeSave: false });

  const csvWriter = createCsvWriter({
    path: csvFilePath,
    header: [
      { id: "studentId", title: "studentId" },
      { id: "name", title: "name" },
      { id: "dob", title: "dob" },
      { id: "category", title: "category" },
      { id: "testId", title: "testId" },
      { id: "score", title: "score" },
      { id: "status", title: "status" },
    ],
    append: true,
  });

  const testId = `${category.name}-${Date.now()}`;

  await csvWriter.writeRecords([
    {
      studentId: student.id,
      name,
      dob,
      category: category.name,
      testId,
      score: "",
      status: "registered",
    },
  ]);

  try {
    await new Email(req.user, {
      categoryName: category.name,
      testId,
      dob,
    }).sendTestRegisterSuccess();
    /*eslint-disable-next-line*/
  } catch (error) {
    return next(new AppError("Có lỗi khi gửi email. Hãy thử lại sau!"), 500);
  }

  res
    .status(201)
    .json({ message: "Đăng ký thành công! Hãy kiểm tra email của bạn." });
});
