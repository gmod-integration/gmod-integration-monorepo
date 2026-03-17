import { type NextFunction, type Request, type Response } from 'express';

export default async (req: Request, res: Response, next: NextFunction) => {
  try {
    req.rawBody = '';
    
    req.on('data', (chunk) => {
      req.rawBody += chunk;
    });

    return next();
  } catch (error) {
    return next(error);
  }
};
