const catchAsync = require("../utils/catchAsync");
const AppError = require("../utils/appError");
const {buildPaginatedQuery } = require("../utils/queryHelper");
const User = require("../models/userModel");


const getListTeacher = catchAsync(async(req,res)=>{
    const {status,page = 1, limit = 10} = req.query;
    const filters = {role:"teacher"};

    const {finalQuery, paginationOptions} = buildPaginatedQuery({
        query: req.query,
        filters,
        searchFields:["username","email","level"],
        page,
        limit,
        select:"username email active profile.photo level avaiable",
        sort: "-createdAt",
    });

    const [total, teachers] = await Promise.all([
        User.countDocuments(finalQuery),
        User.find(finalQuery)
            .skip(paginationOptions.skip)
            .limit(paginationOptions.limit)
            .select(paginationOptions.select)
            .sort(paginationOptions.sort)
            .lean(),
    ]);
    res.status(200).json({
        status:"success",
        results:teachers.length,
        total,
        page:Number(page),
        totalPages:Math.ceil(total/limit),
        data:{teachers}
    })
});


module.exports={
    getListTeacher
}