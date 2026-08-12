import Ajv from 'ajv';

const ajv = new Ajv({ allErrors: true, strict: true });
const validators = new WeakMap();

export function lenientJson(text) {
  if (typeof text !== 'string') return null;
  const candidates = [text];
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) candidates.push(fence[1]);
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first !== -1 && last > first) candidates.push(text.slice(first, last + 1));
  for (const c of candidates) {
    try {
      const v = JSON.parse(c.trim());
      if (v && typeof v === 'object' && !Array.isArray(v)) return v;
    } catch { /* 다음 후보 */ }
  }
  return null;
}

function getValidator(schema) {
  let validate = validators.get(schema);
  if (!validate) {
    validate = ajv.compile(schema);
    validators.set(schema, validate);
  }
  return validate;
}

function formatValidationErrors(errors) {
  return errors.map((error) => {
    const path = error.instancePath || '(root)';
    return `${path} ${error.keyword}: ${error.message}`;
  }).join('; ');
}

/**
 * Parse the model response and enforce the result contract in one place.
 * The returned diagnostics are intentionally suitable for a repair prompt.
 */
export function parseAndValidateJson(text, schema) {
  const value = lenientJson(text);
  if (!value) {
    return {
      ok: false,
      value: null,
      error: 'JSON 파싱 실패',
      errors: [],
    };
  }

  const validate = getValidator(schema);
  if (!validate(value)) {
    const errors = validate.errors ?? [];
    return {
      ok: false,
      value: null,
      error: `Schema 검증 실패: ${formatValidationErrors(errors)}`,
      errors,
    };
  }

  return { ok: true, value, error: null, errors: [] };
}
