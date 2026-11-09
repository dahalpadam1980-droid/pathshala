/** Structured API error with HTTP status code. */
export class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;
  constructor(status: number, message: string, code = 'error', details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
  static badRequest(message: string, details?: unknown) {
    return new ApiError(400, message, 'bad_request', details);
  }
  static unauthorized(message = 'Authentication required') {
    return new ApiError(401, message, 'unauthorized');
  }
  static forbidden(message = 'You do not have permission to perform this action') {
    return new ApiError(403, message, 'forbidden');
  }
  static notFound(message = 'Resource not found') {
    return new ApiError(404, message, 'not_found');
  }
  static conflict(message: string) {
    return new ApiError(409, message, 'conflict');
  }
}
