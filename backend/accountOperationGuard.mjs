const activeUserOperations = new Map();

function normalizeUserId(userId) {
  return String(userId ?? "").trim();
}

function normalizeOperation(operation) {
  return String(operation ?? "").trim();
}

function getOperations(userId) {
  const normalizedUserId =
    normalizeUserId(userId);

  if (!normalizedUserId) {
    return null;
  }

  return (
    activeUserOperations.get(
      normalizedUserId
    ) ?? null
  );
}

export function beginUserAccountOperation(
  userId,
  operation
) {
  const normalizedUserId =
    normalizeUserId(userId);

  const normalizedOperation =
    normalizeOperation(operation);

  if (
    !normalizedUserId ||
    !normalizedOperation
  ) {
    throw new Error(
      "User ID and operation are required."
    );
  }

  let operations =
    activeUserOperations.get(
      normalizedUserId
    );

  if (!operations) {
    operations = new Map();

    activeUserOperations.set(
      normalizedUserId,
      operations
    );
  }

  operations.set(
    normalizedOperation,
    (
      operations.get(
        normalizedOperation
      ) ?? 0
    ) + 1
  );
}

export function endUserAccountOperation(
  userId,
  operation
) {
  const normalizedUserId =
    normalizeUserId(userId);

  const normalizedOperation =
    normalizeOperation(operation);

  if (
    !normalizedUserId ||
    !normalizedOperation
  ) {
    return;
  }

  const operations =
    activeUserOperations.get(
      normalizedUserId
    );

  if (!operations) {
    return;
  }

  const count =
    operations.get(
      normalizedOperation
    ) ?? 0;

  if (count <= 1) {
    operations.delete(
      normalizedOperation
    );
  } else {
    operations.set(
      normalizedOperation,
      count - 1
    );
  }

  if (operations.size === 0) {
    activeUserOperations.delete(
      normalizedUserId
    );
  }
}

export function getActiveUserAccountOperations(
  userId
) {
  const operations =
    getOperations(userId);

  return operations
    ? [...operations.keys()]
    : [];
}

export function hasActiveUserAccountOperation(
  userId
) {
  const operations =
    getOperations(userId);

  return Boolean(
    operations &&
    operations.size > 0
  );
}
