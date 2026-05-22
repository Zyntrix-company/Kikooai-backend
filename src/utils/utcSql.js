/** PostgreSQL expression for today's calendar date at 00:00 UTC boundary. */
export const UTC_TODAY_SQL = `(NOW() AT TIME ZONE 'UTC')::date`;
