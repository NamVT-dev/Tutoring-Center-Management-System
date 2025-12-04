const Center = require("../models/centerModel");
const Course = require("../models/courseModel");
const { Teacher, User } = require("../models/userModel");
const catchAsync = require("../utils/catchAsync");
const {
  embedText,
  aiTranslate,
  // generateCenterConfigEmbedding,
  generateCourseEmbeddingText,
  buildFacts,
  aiResponse,
  generateTeacherEmbeddingText,
} = require("../utils/openAi");

exports.embeddingAllRequireData = catchAsync(async (req, res) => {
  await saveEmbedding(Course, generateCourseEmbeddingText, "category");
  await saveEmbedding(Teacher, generateTeacherEmbeddingText);

  res.status(200).json({
    status: "success",
    message: "Cập nhật thành công",
  });
});

async function saveEmbedding(Model, func, populate) {
  const doc = await Model.find().populate(populate);
  return Promise.all(
    doc.map(async (d) => {
      const textToEmbed = func(d);
      d.embedding = await embedText(textToEmbed);
      await d.save({ validateBeforeSave: false });
    })
  );
}

exports.chatAi = catchAsync(async (req, res) => {
  const engQuestion = await aiTranslate(req.body.question);
  const queryVector = await embedText(engQuestion);
  const fact = buildFacts(await findFact(queryVector));
  const answer = await aiResponse(req.body.question, fact);
  res.status(200).json({
    status: "success",
    data: {
      answer,
    },
  });
});

const findFact = async (queryVector) => {
  const course = await Course.aggregate([
    {
      $vectorSearch: {
        index: "default",
        queryVector,
        path: "embedding",
        exact: true,
        limit: 5,
      },
    },
    {
      $lookup: {
        from: "categories",
        localField: "category",
        foreignField: "_id",
        as: "category",
      },
    },
    { $unwind: "$category" },
    {
      $project: {
        name: 1,
        description: 1,
        category: {
          name: 1,
        },
        level: 1,
        price: 1,
        session: 1,
        durationInMinutes: 1,
        sessionsPerWeek: 1,
        minStudent: 1,
        maxStudent: 1,
        inputMinScore: 1,
        inputMaxScore: 1,
        score: {
          $meta: "vectorSearchScore",
        },
      },
    },
  ]);

  const teacher = await User.aggregate([
    {
      $vectorSearch: {
        index: "default",
        queryVector,
        path: "embedding",
        exact: true,
        limit: 5,
      },
    },
    {
      $project: {
        _id: 0,
        profile: 1,
        level: 1,
        description: 1,
        class: 1,
        skills: 1,
        teachCategories: 1,
        score: {
          $meta: "vectorSearchScore",
        },
      },
    },
  ]);

  const center = await Center.find();

  return { course, center, teacher };
};
