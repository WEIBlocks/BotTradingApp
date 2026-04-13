import { z } from 'zod';
export const paginationSchema = z.object({
    page: z.coerce.number().min(1).default(1),
    limit: z.coerce.number().min(1).max(100).default(20),
});
export function paginate(params) {
    const offset = (params.page - 1) * params.limit;
    return { limit: params.limit, offset };
}
export function paginatedResponse(data, total, params) {
    return {
        data,
        pagination: {
            page: params.page,
            limit: params.limit,
            total,
            totalPages: Math.ceil(total / params.limit),
            hasNext: params.page * params.limit < total,
            hasPrev: params.page > 1,
        },
    };
}
