const express = require("express");
const path = require("path");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const cookieParser = require("cookie-parser");
const xss = require("xss-clean");
const mongoSanitize = require("express-mongo-sanitize");
const compression = require("compression");

const AppError = require("./utils/appError");

const globalErrorHandler = require("./controllers/errorController");

const registedRoutes = require("./routes");
const catchAsync = require("./utils/catchAsync");
const Student = require("./models/studentModel");
const Email = require("./utils/email");

//Start app express
const app = express();

//Implament cors
app.use(
  cors({
    origin: process.env.FRONT_END_URI || "*",
    credentials: true,
  })
);
// Serving static files
app.use(express.static(path.join(__dirname, "public")));

// Set security HTTP header
app.use(helmet());

//Logging
app.use(morgan("dev"));

//Body parser
app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: true, limit: "10kb" }));
app.use(cookieParser());

//Data sanitize against NoSQL query injection
app.use(mongoSanitize());

//Data sanitize against XSS
app.use(xss());

app.use(compression());

app.post(
  "/test-results",
  catchAsync(async (req, res, next) => {
    const { studentId, testScore } = req.body;
    const student = await Student.findById(studentId).populate("user category");
    const categoryName = student.category[0].name;
    const score =
      categoryName === "IELTS" ? (testScore / 12) * 9 : (testScore / 12) * 990;
    const roundedScore =
      categoryName === "IELTS"
        ? 0.5 * Math.round(2 * score)
        : 5 * Math.round(score / 5);
    if (!student) return next(new AppError("Không tìm thấy học viên", 404));
    student.testScore = roundedScore;
    student.testResultAt = Date.now();
    student.tested = true;
    student.save({ validateBeforeSave: false });
    try {
      await new Email(student.user, {
        studentName: student.name,
        category: categoryName,
        score: roundedScore,
      }).sendTestResult();
    } catch (error) {
      console.log("Lỗi khi gửi mail", error.message);
    }
    res.status(200).json({
      status: "success",
      message: "Cập nhật điểm thành công!",
    });
  })
);

app.use(registedRoutes);

app.all("*", (req, res, next) => {
  next(new AppError(`Can't find ${req.originalUrl} on this server`, 404));
});

app.use(globalErrorHandler);

module.exports = app;
