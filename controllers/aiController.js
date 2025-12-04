const Center = require("../models/centerModel");
const Course = require("../models/courseModel");
const catchAsync = require("../utils/catchAsync");
const {
  embedText,
  aiTranslate,
  generateCenterConfigEmbedding,
  generateCourseEmbeddingText,
  buildFacts,
  aiResponse,
} = require("../utils/openAi");

exports.embeddingAllRequireData = catchAsync(async (req, res) => {
  await saveEmbedding(Center, generateCenterConfigEmbedding, "");
  await saveEmbedding(Course, generateCourseEmbeddingText, "category");

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
  const center = await Center.aggregate([
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
        shifts: 1,
        dayShifts: 1,
        key: 1,
        timezone: 1,
        isScheduling: 1,
        isAvailabilityOpen: 1,
        activeDaysOfWeek: 1,
        score: {
          $meta: "vectorSearchScore",
        },
      },
    },
  ]);

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
  return { course, center };
};
