const mongoose = require("mongoose");

const markRecordSchema = new mongoose.Schema({
  student: {
    type: mongoose.Schema.ObjectId,
    ref: "User",
  },
  class: {
    type: mongoose.Schema.ObjectId,
    ref: "Class",
  },
  title: String,
  mark: Number,
  note: String,
});
const MarkRecord = mongoose.model(
  "MarkRecord",
  markRecordSchema,
  "markrecords"
);

module.exports = MarkRecord;
