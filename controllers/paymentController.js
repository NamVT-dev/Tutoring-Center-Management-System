const Payment = require("../models/paymentModel");
const catchAsync = require("../utils/catchAsync");
const AppError = require("../utils/appError");
const mongoose = require("mongoose");
const Enrollment = require("../models/enrollmentModel");
const Class = require("../models/classModel");
const Student = require("../models/studentModel");

exports.getAllPayments = catchAsync(async (req, res) => {
  const payments = await Payment.find({
    userId: req.user.id,
  });

  res.status(200).json({
    status: "success",
    data: payments,
  });
});

exports.getOne = catchAsync(async (req, res, next) => {
  const payment = await Payment.findById(req.params.id);
  if (!payment || !payment.userId === req.user.id)
    return next(new AppError("Không tìm thấy thanh toán", 404));
  res.status(200).json({
    status: "success",
    data: payment,
  });
});

exports.handlePaymentWebhook = catchAsync(async (req, res, next) => {
  // thêm logic xác thực Webhook ở đây

  const event = req.body;

  if (event.event !== "payment.succeeded") {
    return res.status(200).json({ message: "Ignoring non-succeeded event" });
  }

  const { enrollmentId, invoiceId, paidAt } = event;

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const enrollment = await Enrollment.findById(enrollmentId).session(session);
    if (!enrollment) {
      // Lỗi này PSP sẽ retry
      throw new AppError(
        `Webhook Error: Không tìm thấy Enrollment ID: ${enrollmentId}`,
        404
      );
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
      enrollment.paidAt = paidAt || new Date();
      enrollment.invoiceId = invoiceId;
      enrollment.holdExpiresAt = undefined;

      // Cập nhật Class
      classToUpdate.reservedCount -= 1;
      classToUpdate.student.push(enrollment.student);

      // --- ĐỒNG BỘ NGƯỢC VÀO STUDENT (CHO THUẬT TOÁN CŨ) ---
      studentToUpdate.class.push(enrollment.class);
      studentToUpdate.enrolled = true;
      // --- KẾT THÚC ĐỒNG BỘ ---

      // Lưu cả 3
      await enrollment.save({ session });
      await classToUpdate.save({ session });
      await studentToUpdate.save({ session });

      await session.commitTransaction();

      // (Gửi email/SMS xác nhận ở đây)

      return res
        .status(200)
        .json({ message: "Enrollment confirmed successfully" });
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
      return res
        .status(200)
        .json({ message: "Late payment processed, need review" });
    }

    // C. Trường hợp đã 'confirmed' (webhook gọi lại)
    if (enrollment.status === "confirmed") {
      await session.abortTransaction(); // Không cần làm gì
      return res.status(200).json({ message: "Webhook already processed" });
    }

    // Bất kỳ trường hợp nào khác
    throw new AppError(
      `Webhook Error: Trạng thái enrollment không hợp lệ (${enrollment.status})`,
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

