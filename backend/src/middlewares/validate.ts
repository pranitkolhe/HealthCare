import type { Request, Response, NextFunction } from 'express';
import type { ZodTypeAny } from 'zod';

export function validate(schema: ZodTypeAny, target: 'body' | 'query' | 'params') {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[target]);
    if (!result.success) {
      next(result.error);
      return;
    }
    // Express 5 exposes req.query as a read-only getter. Query schemas in
    // this API validate plain string values (without transforms), so retain
    // Express's query object after validation instead of assigning to it.
    // Bodies and route params remain safely replaced by their parsed values.
    if (target !== 'query') {
      req[target] = result.data;
    }
    next();
  };
}
