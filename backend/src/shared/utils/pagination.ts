export function getPagination(page?: number, limit?: number) {
  const currentPage = typeof page === 'number' && Number.isFinite(page) && page > 0 ? page : 1;
  const pageSize = typeof limit === 'number' && Number.isFinite(limit) && limit > 0 && limit <= 100 ? limit : 20;
  const skip = (currentPage - 1) * pageSize;
  return { page: currentPage, limit: pageSize, skip };
}
