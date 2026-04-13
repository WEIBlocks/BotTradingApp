import { ForbiddenError } from '../lib/errors.js';
export function authorize(...roles) {
    return async (request, _reply) => {
        if (!request.user) {
            throw new ForbiddenError('Not authenticated');
        }
        if (!roles.includes(request.user.role)) {
            throw new ForbiddenError(`Requires one of: ${roles.join(', ')}`);
        }
    };
}
