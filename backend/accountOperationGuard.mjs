const userAccountStates =
  new Map();

function normalizeUserId(userId) {
  return String(userId ?? "").trim();
}

function normalizeOperation(operation) {
  return String(operation ?? "").trim();
}

function requireUserId(userId) {
  const normalizedUserId =
    normalizeUserId(userId);

  if (!normalizedUserId) {
    throw new Error(
      "User ID is required."
    );
  }

  return normalizedUserId;
}

function requireOperation(operation) {
  const normalizedOperation =
    normalizeOperation(operation);

  if (!normalizedOperation) {
    throw new Error(
      "Operation is required."
    );
  }

  return normalizedOperation;
}

function getState(userId) {
  const normalizedUserId =
    normalizeUserId(userId);

  if (!normalizedUserId) {
    return null;
  }

  return (
    userAccountStates.get(
      normalizedUserId
    ) ?? null
  );
}

function getOrCreateState(userId) {
  const normalizedUserId =
    requireUserId(userId);

  let state =
    userAccountStates.get(
      normalizedUserId
    );

  if (!state) {
    state = {
      deleting: false,
      operations: new Map()
    };

    userAccountStates.set(
      normalizedUserId,
      state
    );
  }

  return {
    normalizedUserId,
    state
  };
}

function removeStateIfIdle(
  normalizedUserId,
  state
) {
  if (
    !state.deleting &&
    state.operations.size === 0
  ) {
    userAccountStates.delete(
      normalizedUserId
    );
  }
}

export function beginUserAccountOperation(
  userId,
  operation
) {
  const normalizedOperation =
    requireOperation(operation);

  const {
    normalizedUserId,
    state
  } =
    getOrCreateState(userId);

  if (state.deleting) {
    const error =
      new Error(
        "Account deletion is in progress."
      );

    error.code =
      "ACCOUNT_DELETION_IN_PROGRESS";

    throw error;
  }

  state.operations.set(
    normalizedOperation,
    (
      state.operations.get(
        normalizedOperation
      ) ?? 0
    ) + 1
  );

  return true;
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

  const state =
    userAccountStates.get(
      normalizedUserId
    );

  if (!state) {
    return;
  }

  const count =
    state.operations.get(
      normalizedOperation
    ) ?? 0;

  if (count <= 1) {
    state.operations.delete(
      normalizedOperation
    );
  } else {
    state.operations.set(
      normalizedOperation,
      count - 1
    );
  }

  removeStateIfIdle(
    normalizedUserId,
    state
  );
}

export function beginUserAccountDeletion(
  userId
) {
  const {
    state
  } =
    getOrCreateState(userId);

  if (
    state.deleting ||
    state.operations.size > 0
  ) {
    return false;
  }

  state.deleting = true;

  return true;
}

export function endUserAccountDeletion(
  userId
) {
  const normalizedUserId =
    normalizeUserId(userId);

  if (!normalizedUserId) {
    return;
  }

  const state =
    userAccountStates.get(
      normalizedUserId
    );

  if (!state) {
    return;
  }

  state.deleting = false;

  removeStateIfIdle(
    normalizedUserId,
    state
  );
}

export function isUserAccountDeletionInProgress(
  userId
) {
  return Boolean(
    getState(userId)?.deleting
  );
}

export function getActiveUserAccountOperations(
  userId
) {
  const state =
    getState(userId);

  return state
    ? [...state.operations.keys()]
    : [];
}

export function hasActiveUserAccountOperation(
  userId
) {
  const state =
    getState(userId);

  return Boolean(
    state &&
    state.operations.size > 0
  );
}
