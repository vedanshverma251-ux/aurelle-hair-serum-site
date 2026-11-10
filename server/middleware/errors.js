class AppError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const notFound = (req, res) => res.status(404).json({ error: 'Not found' });

// Never leaks stack traces or internal messages to the client.
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);
  if (err instanceof AppError) return res.status(err.status).json({ error: err.message, code: err.code });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Malformed JSON' });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Payload too large' });
  console.error(JSON.stringify({ level: 'error', msg: err.message, method: req.method, path: req.path, time: new Date().toISOString() }));
  return res.status(500).json({ error: 'Something went wrong. Please try again.' });
}

module.exports = { AppError, asyncHandler, notFound, errorHandler };
