const { z } = require('zod');

// Trimmed text with angle brackets and control characters stripped (defence in depth; the UI also escapes output).
const text = (min = 1, max = 200) =>
  z
    .string()
    .trim()
    // eslint-disable-next-line no-control-regex
    .transform((s) => s.replace(/[<>\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ''))
    .pipe(z.string().min(min).max(max));

const email = z.string().trim().toLowerCase().email().max(254);

const validate =
  (schema, source = 'body') =>
  (req, res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      return res.status(400).json({
        error: 'Invalid input',
        details: result.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      });
    }
    req[source] = result.data;
    return next();
  };

module.exports = { z, text, email, validate };
