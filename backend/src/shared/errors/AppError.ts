export class AppError extends Error {
  public statusCode: number;
  public errorCode: string;
  public details: Record<string, unknown>;

  constructor(statusCode: number, errorCode: string, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details: Record<string, unknown> = {}) {
    super(400, 'VALIDATION_ERROR', message, details);
  }
}

export class UnauthenticatedError extends AppError {
  constructor(message = 'Authentication required') {
    super(401, 'UNAUTHENTICATED', message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super(403, 'FORBIDDEN', message);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(404, 'NOT_FOUND', message);
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Conflict', details: Record<string, unknown> = {}) {
    super(409, 'CONFLICT', message, details);
  }
}

export class SlotAlreadyBookedError extends AppError {
  constructor(message = 'This slot was just booked by another patient. Please choose another slot.') {
    super(409, 'SLOT_ALREADY_BOOKED', message);
  }
}

export class UnprocessableError extends AppError {
  constructor(message = 'Unprocessable entity', details: Record<string, unknown> = {}) {
    super(422, 'UNPROCESSABLE', message, details);
  }
}
