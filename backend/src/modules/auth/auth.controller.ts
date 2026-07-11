import type { Request, Response, NextFunction } from 'express';
import * as authService from './auth.service';
import env from '../../config/env';
import { UnauthenticatedError } from '../../shared/errors/AppError';

function refreshCookieOptions() {
  const isProduction = env.nodeEnv === 'production';
  return {
    httpOnly: true,
    secure: isProduction,
    // Different ports on localhost are same-site. Deployed Vercel and Render
    // hosts are cross-site, so the browser needs SameSite=None to send this
    // cookie to /auth/refresh.
    sameSite: isProduction ? ('none' as const) : ('lax' as const),
    ...(isProduction && env.cookieDomain ? { domain: env.cookieDomain } : {}),
    maxAge: 7 * 24 * 60 * 60 * 1000,
  };
}

export async function register(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await authService.registerPatient(req.body);
    // Set refresh cookie on registration to mirror login behavior
    if (result.refreshToken) {
      res.cookie(env.refreshCookieName, result.refreshToken, refreshCookieOptions());
    }
    res.status(201).json({ accessToken: result.accessToken, user: result.user });
  } catch (error) {
    next(error);
  }
}

export async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await authService.loginUser(req.body);
    res.cookie(env.refreshCookieName, result.refreshToken, refreshCookieOptions());
    res.status(200).json({ accessToken: result.accessToken, user: result.user });
  } catch (error) {
    next(error);
  }
}

export async function refresh(req: Request, res: Response, next: NextFunction) {
  try {
    const refreshToken = req.cookies[env.refreshCookieName];
    if (!refreshToken) {
      throw new UnauthenticatedError('Refresh token missing');
    }
    const result = await authService.refreshAccessToken(refreshToken);
    res.cookie(env.refreshCookieName, result.refreshToken, refreshCookieOptions());
    res.status(200).json({ accessToken: result.accessToken });
  } catch (error) {
    next(error);
  }
}

export async function logout(req: Request, res: Response, next: NextFunction) {
  try {
    const refreshToken = req.cookies[env.refreshCookieName];
    if (refreshToken) {
      await authService.logoutUser(refreshToken);
    }
    res.clearCookie(env.refreshCookieName, refreshCookieOptions());
    res.status(204).send();
  } catch (error) {
    next(error);
  }
}

export async function changePassword(req: Request, res: Response, next: NextFunction) {
  try {
    await authService.changePassword(req.user!.id, req.body.currentPassword, req.body.newPassword);
    res.clearCookie(env.refreshCookieName, refreshCookieOptions());
    res.status(204).send();
  } catch (error) {
    next(error);
  }
}
