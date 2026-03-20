export function success(res, data, statusCode = 200) {
  return res.status(statusCode).json({ success: true, data });
}

export function fail(res, message, code, statusCode = 400) {
  return res.status(statusCode).json({ success: false, error: message, code });
}
