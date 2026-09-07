import type { RegisterResult } from '@social-cup/types';
import {
  forgotPasswordSchema,
  loginSchema,
  logoutSchema,
  refreshTokenSchema,
  registerSchema,
  resendVerificationSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from '@social-cup/validation';
import { Router } from 'express';

import { asyncHandler } from '../../lib/asyncHandler.js';
import { validateBody } from '../../middleware/validate.js';
import {
  forgotPasswordRateLimit,
  loginRateLimit,
  refreshRateLimit,
  registerRateLimit,
  resendVerificationRateLimit,
  resetPasswordRateLimit,
} from '../../middleware/rateLimit.js';
import type { AuthService } from '../../services/authService.js';

const GENERIC_RESET_RESPONSE =
  'If an account exists for this email, a password reset link has been sent.';

/**
 * All Phase 1 identity routes (PRD Module 2). Handlers stay thin: body
 * validation via shared Zod schemas, business logic in the AuthService, and
 * the same success envelope ({ success, data }) on every response. Email
 * sending happens inside the service through the EmailService abstraction,
 * never in a route handler.
 */
export function createAuthRouter(authService: AuthService): Router {
  const router: Router = Router();

  router.post(
    '/register',
    registerRateLimit(),
    validateBody(registerSchema),
    asyncHandler(async (req, res) => {
      const result = await authService.register(req.body);
      const body: { success: true; data: RegisterResult } = { success: true, data: result };
      res.status(201).json(body);
    }),
  );

  router.post(
    '/verify-email',
    validateBody(verifyEmailSchema),
    asyncHandler(async (req, res) => {
      const result = await authService.verifyEmail(req.body.token);
      res.status(200).json({ success: true, data: result });
    }),
  );

  router.post(
    '/resend-verification',
    resendVerificationRateLimit(),
    validateBody(resendVerificationSchema),
    asyncHandler(async (req, res) => {
      await authService.resendVerification(req.body.email);
      res.status(200).json({
        success: true,
        data: { message: 'If an account needs verification, a new link has been sent.' },
      });
    }),
  );

  router.post(
    '/login',
    loginRateLimit(),
    validateBody(loginSchema),
    asyncHandler(async (req, res) => {
      const result = await authService.login(req.body);
      res.status(200).json({ success: true, data: result });
    }),
  );

  router.post(
    '/refresh',
    refreshRateLimit(),
    validateBody(refreshTokenSchema),
    asyncHandler(async (req, res) => {
      const result = await authService.refresh(req.body.refreshToken);
      res.status(200).json({ success: true, data: result });
    }),
  );

  router.post(
    '/logout',
    validateBody(logoutSchema),
    asyncHandler(async (req, res) => {
      await authService.logout(req.body.refreshToken);
      res.status(204).send();
    }),
  );

  router.post(
    '/forgot-password',
    forgotPasswordRateLimit(),
    validateBody(forgotPasswordSchema),
    asyncHandler(async (req, res) => {
      await authService.forgotPassword(req.body.email);
      res.status(200).json({ success: true, data: { message: GENERIC_RESET_RESPONSE } });
    }),
  );

  router.post(
    '/reset-password',
    resetPasswordRateLimit(),
    validateBody(resetPasswordSchema),
    asyncHandler(async (req, res) => {
      const result = await authService.resetPassword(req.body);
      res.status(200).json({ success: true, data: result });
    }),
  );

  return router;
}
