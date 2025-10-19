const catchAsync = require("../utils/catchAsync");
const fs = require("fs");
const path = require("path");
const AppError = require("../utils/appError");
const { Member } = require("../models/userModel");
const Category = require("../models/categoryModel");
const Student = require("../models/studentModel");
const createCsvWriter = require("csv-writer").createObjectCsvWriter;

const csvFilePath = path.join(__dirname, "..", "public", "results.csv");

if (!fs.existsSync(csvFilePath)) {
  fs.writeFileSync("results.csv", "name,email,testId,score,status\n");
}

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
      name,
      dob,
      category: category.name,
      testId,
      score: "",
      status: "registered",
    },
  ]);

  res.status(201).json({ message: "Đăng ký thành công!" });
});
