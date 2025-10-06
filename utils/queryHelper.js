exports.buildPaginatedQuery = ({
  query,
  filters = {},
  searchFields = [],
  page = 1,
  limit = 10,
  select = "",
  sort = "-createdAt",
}) => {
  const finalQuery = { ...filters };

  if (query.search && searchFields.length > 0) {
    finalQuery.$or = searchFields.map((field) => ({
      [field]: { $regex: query.search, $options: "i" },
    }));
  }

  const pageNum = Number(page) || 1;
  const limitNum = Number(limit) || 10;
  const skip = (pageNum - 1) * limitNum;

  return {
    finalQuery,
    paginationOptions: {
      skip,
      limit: limitNum,
      select,
      sort,
    },
  };
};