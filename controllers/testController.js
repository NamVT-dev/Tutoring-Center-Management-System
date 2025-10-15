const catchAsync = require("../utils/catchAsync");
const fs = require("fs");
const path = require("path");
const AppError = require("../utils/appError");
const createCsvWriter = require("csv-writer").createObjectCsvWriter;

const csvFilePath = path.join(__dirname, "..", "public", "results.csv");

if (!fs.existsSync(csvFilePath)) {
  fs.writeFileSync("results.csv", "name,email,testId,score,status\n");
}

exports.registerTest = catchAsync(async (req, res, next) => {
  const { name, dob, course, testId } = req.body;
  if (!name || !dob || !course || !testId) {
    return next(new AppError("Thiếu thông tin cần thiết", 400));
  }

  const csvWriter = createCsvWriter({
    path: csvFilePath,
    header: [
      { id: "name", title: "name" },
      { id: "dob", title: "dob" },
      { id: "course", title: "course" },
      { id: "testId", title: "testId" },
      { id: "score", title: "score" },
      { id: "status", title: "status" },
    ],
    append: true,
  });

  await csvWriter.writeRecords([
    { name, dob, course, testId, score: "", status: "registered" },
  ]);

  res.json({ message: "Đăng ký thành công!" });
});
