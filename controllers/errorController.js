const AppError = require("./../utils/appError");

const handleCastErrorDB = (err) => {
  const message = `${err.path} không hợp lệ: ${err.value}.`;
  return new AppError(message, 400);
};

const handleDuplicateFieldsDB = (err) => {
  const value = err.errmsg.match(/(["'])(\\?.)*?\1/)[0];

  const message = `Dữ liệu trùng lặp: ${value}. Hãy thử lại!`;
  return new AppError(message, 400);
};

const handleValidationErrorDB = (err) => {
  const errors = Object.values(err.errors).map((el) => el.message);

  const message = `Dữ liệu không hợp lệ. ${errors.join(". ")}`;
  return new AppError(message, 400);
};

const handleJWTError = () =>
  new AppError("Token không hợp lệ. Hãy đăng nhập lại!", 401);

const handleJWTExpiredError = () =>
  new AppError("Token hết hạn! Hãy đăng nhập lại.", 401);

const sendError = (err, req, res) =>
  res.status(err.statusCode).json({
    status: err.status,
    message: err.message,
  });

module.exports = (err, req, res, next) => {
  console.log(err);
  err.statusCode = err.statusCode || 500;
  err.status = err.status || "error";

  if (err.name === "CastError") err = handleCastErrorDB(err);
  if (err.code === 11000) err = handleDuplicateFieldsDB(err);
  if (err.name === "ValidationError") err = handleValidationErrorDB(err);
  if (err.name === "JsonWebTokenError") err = handleJWTError();
  if (err.name === "TokenExpiredError") err = handleJWTExpiredError();

  sendError(err, req, res);

  next();
};
