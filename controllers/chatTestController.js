const Course = require("../models/courseModel");
const { embedText, buildFacts, aiResponse } = require("../utils/embedText");

exports.chatTest = async (req, res) => {
  try {
    const { question } = req.body;
    const queryEmbedding = await embedText(question);
    const pipeline = [
      {
        $vectorSearch: {
          index: "embedding_index",
          queryVector: queryEmbedding,
          path: "embedding",
          exact: true,
          // numCandidates: 20,
          limit: 10,
        },
      },
      // {
      //   $project: {
      //     _id: 0,
      //     text: 1,
      //     score: {
      //       $meta: "vectorSearchScore",
      //     },
      //   },
      // },
      {
        $project: {
          embedding: 0,
          __v: 0,
        },
      },
    ];
    const results = await Course.aggregate(pipeline);
    const facts = buildFacts(results);
    const response = await aiResponse(question, facts);
    return res.status(200).json({
      length: results.length,
      results,
      response,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      message: "Something went wrong!",
    });
  }
};
