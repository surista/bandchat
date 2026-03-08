import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis;

const prisma = globalForPrisma.prisma ?? new PrismaClient();

// Soft-delete middleware: auto-filter deleted User and Workspace records
const SOFT_DELETE_MODELS = ['User', 'Workspace'];
const FILTERED_ACTIONS = ['findFirst', 'findMany', 'count', 'aggregate', 'groupBy'];

function hasDeletedAtFilter(where) {
  if (!where) return false;
  if ('deletedAt' in where) return true;
  // Check inside AND/OR/NOT
  for (const key of ['AND', 'OR', 'NOT']) {
    if (where[key]) {
      const items = Array.isArray(where[key]) ? where[key] : [where[key]];
      if (items.some(item => hasDeletedAtFilter(item))) return true;
    }
  }
  return false;
}

prisma.$use(async (params, next) => {
  if (!SOFT_DELETE_MODELS.includes(params.model)) return next(params);

  // For findUnique/findFirst with unique constraints, convert to findFirst with deletedAt filter
  if (params.action === 'findUnique') {
    // Skip if caller already mentions deletedAt
    if (hasDeletedAtFilter(params.args?.where)) return next(params);

    // Convert findUnique to findFirst so we can add the deletedAt filter
    params.action = 'findFirst';
    const uniqueWhere = params.args.where;
    // Flatten compound keys (e.g. userId_workspaceId: {userId, workspaceId})
    const flatWhere = {};
    for (const [key, value] of Object.entries(uniqueWhere)) {
      if (typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof Date)) {
        // Compound key — spread its fields
        Object.assign(flatWhere, value);
      } else {
        flatWhere[key] = value;
      }
    }
    params.args.where = { ...flatWhere, deletedAt: null };
    return next(params);
  }

  // For list/count/aggregate operations, inject deletedAt: null
  if (FILTERED_ACTIONS.includes(params.action)) {
    if (hasDeletedAtFilter(params.args?.where)) return next(params);

    if (!params.args) params.args = {};
    if (!params.args.where) params.args.where = {};
    params.args.where.deletedAt = null;
    return next(params);
  }

  // For update/delete operations, don't interfere
  return next(params);
});

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export { prisma };
export default prisma;
