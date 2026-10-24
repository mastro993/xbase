import { z } from 'zod';
import { ValidationError } from './errors';

/** Parses `data` with `schema`, or throws a ValidationError listing every problem in plain words. */
export function parseInput<S extends z.ZodType>(schema: S, data: unknown): z.output<S> {
  const parsed = schema.safeParse(data);
  if (!parsed.success) throw new ValidationError(z.prettifyError(parsed.error));
  return parsed.data;
}

/**
 * A server function's `.validator()`: callers get the schema's input type, bad data a readable
 * error. Passing the schema itself would throw its raw issues as a JSON string.
 */
export function validator<S extends z.ZodType>(schema: S) {
  return (data: z.input<S>): z.output<S> => parseInput(schema, data);
}
