import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
function parseExpiry(value) {
    const match = value.match(/^(\d+)(s|m|h|d)$/);
    if (!match)
        return 900; // default 15 min
    const num = parseInt(match[1], 10);
    const unit = match[2];
    if (unit === 's')
        return num;
    if (unit === 'm')
        return num * 60;
    if (unit === 'h')
        return num * 3600;
    if (unit === 'd')
        return num * 86400;
    return 900;
}
export function signAccessToken(payload) {
    return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
        expiresIn: parseExpiry(env.JWT_ACCESS_EXPIRES_IN),
    });
}
export function signRefreshToken(payload) {
    return jwt.sign(payload, env.JWT_REFRESH_SECRET, {
        expiresIn: parseExpiry(env.JWT_REFRESH_EXPIRES_IN),
    });
}
export function verifyAccessToken(token) {
    return jwt.verify(token, env.JWT_ACCESS_SECRET);
}
export function verifyRefreshToken(token) {
    return jwt.verify(token, env.JWT_REFRESH_SECRET);
}
