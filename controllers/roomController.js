const catchAsync = require("../utils/catchAsync");
const AppError = require("../utils/appError");
const { buildPaginatedQuery } = require("../utils/queryHelper");
const Room = require("../models/roomModel");
const Session = require("../models/sessionModel");

function normalizeName(name) {
  return String(name || "")
    .trim()
    .replace(/\s+/g, " ");
}

const createRoom = catchAsync(async (req, res, next) => {
  const name = normalizeName(req.body.name);
  const capacity = Number(req.body.capacity);
  const status = req.body.status;

  if (!name) return next(new AppError("hãy nhập tên phòng", 400));
  if (!Number.isFinite(capacity) || capacity < 1)
    return next(new AppError("capacity phải >=1", 400));

  try {
    const room = await Room.create({ name, capacity, status });
    return res.status(201).json({
      status: "success",
      data: { room },
    });
  } catch (error) {
    if (error.code === 11000) {
      return next(new AppError(`Tên phòng "${name}" đã tồn tại`, 409));
    }
    throw error;
  }
});
const updateRoom = catchAsync(async (req, res, next) => {
  const { id } = req.params;

  const payload = {};
  if (req.body.name !== undefined) payload.name = normalizeName(req.body.name);
  if (req.body.capacity !== undefined)
    payload.capacity = Number(req.body.capacity);
  if (req.body.status !== undefined) payload.status = req.body.status;

  if (
    payload.capacity !== undefined &&
    (!Number.isFinite(payload.capacity) || payload.capacity < 1)
  ) {
    return next(new AppError("capacity phải là số ≥ 1", 400));
  }
  try {
    const updated = await Room.findByIdAndUpdate(id, payload, {
      new: true,
      runValidators: true,
    });

    if (!updated) return next(new AppError("Không tìm thấy phòng", 404));
    return res.status(200).json({
      status: "success",
      data: { updated },
    });
  } catch (error) {
    if (error.code === 11000) {
      return next(new AppError(`Tên phòng "${payload.name}" đã tồn tại`, 409));
    }
    throw error;
  }
});

const listRoom = catchAsync(async (req, res, next) => {
  const { status } = req.query;
  const filters = {};
  if (status) filters.status = status;

  const rooms = await Room.find(filters)
    .select("name capacity status _id")
    .sort("name");
  res.status(200).json({
    status: "success",
    results: rooms.length,
    data: { rooms },
  });
});
const deleteRoom = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const { force } = req.query;

  const now = new Date();
  const inUse = await Session.findOne({
    room: id,
    status: { $in: ["scheduled"] },
    endAt: { $gte: now },
  })
    .select("_id startAt endAt status")
    .lean();

  if (inUse) {
    if (force === "close") {
      const updated = await Room.findByIdAndUpdate(
        id,
        { $set: { status: "closed" } },
        { new: true, runValidators: true }
      );
      if (!updated) return next(new AppError("Không tìm thấy phòng", 404));
      return res.status(200).json({
        status: "success",
        message:
          "Phòng đang được sử dụng. Đã chuyển trạng thái sang 'closed' thay vì xoá.",
        data: { room: updated },
      });
    }
    return next(
      new AppError(
        "Phòng đang được sử dụng trong lịch học. Không thể xoá (dùng ?force=close).",
        409
      )
    );
  }

  const deleted = await Room.findByIdAndDelete(id);
  if (!deleted) return next(new AppError("Không tìm thấy phòng", 404));

  return res.status(200).json({
    status: "success",
    message: "Đã xoá phòng",
    data: { roomId: id },
  });
});

module.exports = {
  createRoom,
  updateRoom,
  listRoom,
  deleteRoom,
};
