function positiveUnixTime(value) {
  const seconds = Number(value);

  if (!Number.isFinite(seconds) || seconds <= 0) {
    return null;
  }

  return seconds;
}

function itemPeriodValues(subscription, fieldName) {
  const items =
    Array.isArray(subscription?.items?.data)
      ? subscription.items.data
      : [];

  if (items.length === 0) {
    return null;
  }

  const values =
    items.map(
      (item) =>
        positiveUnixTime(item?.[fieldName])
    );

  if (values.some((value) => value === null)) {
    return null;
  }

  return values;
}

export function stripeSubscriptionPeriodStart(subscription) {
  const legacy =
    positiveUnixTime(
      subscription?.current_period_start
    );

  if (legacy !== null) {
    return legacy;
  }

  const itemStarts =
    itemPeriodValues(
      subscription,
      "current_period_start"
    );

  if (!itemStarts) {
    return null;
  }

  return Math.max(...itemStarts);
}

export function stripeSubscriptionPeriodEnd(subscription) {
  const legacy =
    positiveUnixTime(
      subscription?.current_period_end
    );

  if (legacy !== null) {
    return legacy;
  }

  const itemEnds =
    itemPeriodValues(
      subscription,
      "current_period_end"
    );

  if (!itemEnds) {
    return null;
  }

  return Math.min(...itemEnds);
}