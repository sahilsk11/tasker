export class BadRequestError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "BadRequestError";
  }
}

export class ConflictError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "ConflictError";
  }
}

export class SessionMessageConflictError extends ConflictError {
  public readonly conflictingExternalIds: readonly string[];

  public constructor(
    sessionId: string,
    conflictingExternalIds: readonly string[]
  ) {
    super(
      `Conflicting session messages for session ${sessionId}: ${conflictingExternalIds.join(", ")}`
    );
    this.name = "SessionMessageConflictError";
    this.conflictingExternalIds = conflictingExternalIds;
  }
}

export class NotFoundError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}
