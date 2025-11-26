const Payment = require("../models/paymentModel");
const catchAsync = require("../utils/catchAsync");
const AppError = require("../utils/appError");
const mongoose = require("mongoose");
const Enrollment = require("../models/enrollmentModel");
const Class = require("../models/classModel");
const Student = require("../models/studentModel");
const factory = require("./handlerFactory");
const { notifyPaymentConfirmed } = require("../utils/notification");
const vnpay = require("../config/vnpay");
const APIFeatures = require("../utils/apiFeatures");
const { User } = require("../models/userModel");

exports.getMyPayments = catchAsync(async (req, res) => {
  const payments = await Payment.find({
    user: req.user.id,
  });

  res.status(200).json({
    status: "success",
    data: payments,
  });
});

exports.getOneByMember = catchAsync(async (req, res, next) => {
  const payment = await Payment.findById(req.params.id);
  if (!payment || payment.user.toString() !== req.user.id.toString())
    return next(new AppError("Không tìm thấy thanh toán", 404));
  res.status(200).json({
    status: "success",
    data: payment,
  });
});

exports.handlePayment = catchAsync(async (req, res) => {
  const verify = vnpay.verifyReturnUrl(req.query);

  const { vnp_TxnRef: enrollmentId, vnp_TransactionNo: invoiceId } = req.query;

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const enrollment = await Enrollment.findById(enrollmentId).session(session);
    if (!enrollment) {
      throw new AppError(
        `Webhook Error: Không tìm thấy Enrollment ID: ${enrollmentId}`,
        404
      );
    }

    if (!verify.isSuccess) {
      enrollment.status = "cancel";
      enrollment.save();
      throw new AppError("Thanh toán thất bại", 400);
    }

    // A. Xử lý trường hợp lý tưởng: Thanh toán khi 'hold' CÒN HẠN
    if (enrollment.status === "hold" && enrollment.holdExpiresAt > new Date()) {
      const classToUpdate = await Class.findById(enrollment.class).session(
        session
      );
      if (!classToUpdate) {
        throw new AppError(
          `Webhook Error: Không tìm thấy Class ID: ${enrollment.class}`,
          404
        );
      }

      const studentToUpdate = await Student.findById(
        enrollment.student
      ).session(session);
      if (!studentToUpdate) {
        throw new AppError(
          `Webhook Error: Không tìm thấy Student ID: ${enrollment.student}`,
          404
        );
      }

      // Đổi trạng thái Enrollment
      enrollment.status = "confirmed";
      enrollment.paidAt = new Date();
      enrollment.invoiceId = invoiceId;
      enrollment.holdExpiresAt = undefined;

      // Cập nhật Class
      classToUpdate.reservedCount -= 1;
      classToUpdate.student.push(enrollment.student);
      //cạp nhật Student
      studentToUpdate.class.push(enrollment.class);
      studentToUpdate.enrolled = true;

      await Payment.create(
        [
          {
            user: studentToUpdate.user,
            amount: enrollment.amount,
            providerPaymentId: enrollment.invoiceId,
            status: "succeeded",
            description: `Thanh toán lớp ${classToUpdate.name} (HV: ${studentToUpdate.name})`,
            invoiceId: enrollment._id.toString(),
          },
        ],
        { session: session }
      );

      // Lưu cả 3
      await enrollment.save({ session });
      await classToUpdate.save({ session });
      await studentToUpdate.save({ session });

      await session.commitTransaction();

      notifyPaymentConfirmed(enrollment.student, enrollment);

      return res.status(200).json({
        status: "success",
        message: "Thanh toán thành công",
      });
    }

    // B. Xử lý trường hợp 'hold' ĐÃ HẾT HẠN
    if (
      enrollment.status === "canceled" ||
      (enrollment.status === "hold" && enrollment.holdExpiresAt <= new Date())
    ) {
      console.warn(
        `[Late Payment] Enrollment ${enrollmentId} đã hết hạn hold. Cần review.`
      );
      // (Thực hiện logic hoàn tiền hoặc báo admin ở đây)
      await session.commitTransaction(); // Commit để ghi nhận log
      return res.status(200).json({ message: "Thanh toán trễ, cần xử lý lại" });
    }

    // C. Trường hợp đã 'confirmed' (webhook gọi lại)
    if (enrollment.status === "confirmed") {
      await session.abortTransaction(); // Không cần làm gì
      return res.status(200).json({ message: "Thanh toán đã được xử lý" });
    }

    // Bất kỳ trường hợp nào khác
    throw new AppError(
      `Trạng thái enrollment không hợp lệ (${enrollment.status})`,
      400
    );
  } catch (error) {
    // Nếu có lỗi, Abort
    await session.abortTransaction();
    // Ném lỗi ra ngoài để catchAsync xử lý (và trả về 500 cho PSP retry)
    throw error;
  } finally {
    // Luôn luôn kết thúc session
    session.endSession();
  }
});

exports.getAllPayment = catchAsync(async (req, res) => {
  const features = new APIFeatures(Payment.find(), req.query)
    .filter()
    .sort()
    .limitFields()
    .paginate()
    .search();

  const totalDocuments = await features.countDocuments(Payment);
  await features.searchByRef(User, ["profile.fullname", "email"]);

  const doc = await features.query;
  const limit = req.query.limit * 1 || 100;
  const totalPages = Math.ceil(totalDocuments / limit);

  res.status(200).json({
    status: "success",
    results: doc.length,
    totalPages,
    data: {
      data: doc,
    },
  });
});

exports.getOne = factory.getOne(Payment);

exports.refundPayment = catchAsync(async (req, res, next) => {
  const payment = await Payment.findById(req.params.id);
  if (!payment) return next(new AppError("Không tìm thấy thanh toán", 404));
  if (payment.status !== "succeeded")
    return next(new AppError("Thanh toán không hợp lệ", 400));

  const enrollment = await Enrollment.findById(payment.invoiceId);
  if (!enrollment)
    return next(new AppError("Không tìm thấy enrollment tương ứng", 400));
  if (enrollment.status === "confirmed")
    return next(
      new AppError(
        "Không thể hoàn tiền thanh toán này (học viên đã xác nhận lớp)",
        400
      )
    );

  //Update payment status
  payment.status = "refunded";
  await payment.save();

  //Update enrollment

  enrollment.status = "canceled";
  await enrollment.save();

  res.status(200).json({ status: "success", message: "Hoàn tiền thành công" });
});
