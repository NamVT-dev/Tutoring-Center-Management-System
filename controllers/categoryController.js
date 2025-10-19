const Category = require("../models/categoryModel");
const catchAsync = require("../utils/catchAsync");

exports.createCategory = catchAsync(async (req, res) => {
  const category = await Category.create(req.body);

  res.status(201).json({
    status: "success",
    data: {
      data: category,
    },
  });
});

exports.getAllCategories = catchAsync(async (req, res) => {
  const categories = await Category.find({});
  res.status(200).json({
    status: "success",
    data: {
      data: categories,
    },
  });
});
