export const PAGE_SIZE = 10;

function parseNonNegativeInteger(value, fallback) {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return fallback;
  return Number(value);
}

export function parsePaginationQuery(query = {}) {
  const requestedLimit = parseNonNegativeInteger(query.limit, PAGE_SIZE);
  const offset = parseNonNegativeInteger(query.offset, 0);
  return {
    limit: requestedLimit > 0 ? Math.min(requestedLimit, PAGE_SIZE) : PAGE_SIZE,
    offset,
    search: typeof query.search === 'string' ? query.search.trim() : '',
  };
}
