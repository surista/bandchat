import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { Resend } from 'resend';
import { OAuth2Client } from 'google-auth-library';
import { authenticate } from '../middleware/auth.js';
import { authLimiter } from '../middleware/rateLimit.js';
import prisma from '../lib/prisma.js';

const router = express.Router();
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const googleClient = process.env.GOOGLE_CLIENT_ID ? new OAuth2Client(process.env.GOOGLE_CLIENT_ID) : null;

// Minimum password length (increased from 6 to 8 for better security)
const MIN_PASSWORD_LENGTH = 8;

/**
 * Hash a refresh token for secure storage.
 * Uses SHA-256 which is fast for lookups but prevents token theft if DB is breached.
 * @param {string} token - The refresh token to hash
 * @returns {string} - Hex-encoded hash
 */
const hashRefreshToken = (token) => {
  return crypto.createHash('sha256').update(token).digest('hex');
};

/**
 * Validates a display name for security and usability.
 * @param {string} displayName - The display name to validate
 * @returns {{valid: boolean, error?: string}}
 */
const validateDisplayName = (displayName) => {
  if (!displayName || typeof displayName !== 'string') {
    return { valid: false, error: 'Display name is required' };
  }

  const trimmed = displayName.trim();

  if (trimmed.length < 2) {
    return { valid: false, error: 'Display name must be at least 2 characters' };
  }

  if (trimmed.length > 50) {
    return { valid: false, error: 'Display name must be 50 characters or less' };
  }

  // Allow letters, numbers, spaces, hyphens, underscores, and common accented characters
  // Block potentially dangerous characters that could be used for XSS
  const dangerousPattern = /[<>'"&\\\/\x00-\x1f]/;
  if (dangerousPattern.test(trimmed)) {
    return { valid: false, error: 'Display name contains invalid characters' };
  }

  return { valid: true };
};

// Send verification email
const sendVerificationEmail = async (email, token) => {
  if (!resend) {
    if (process.env.NODE_ENV !== 'production') {
      console.log('Email not configured. Verification token:', token);
    }
    return;
  }

  const verifyUrl = `${process.env.CLIENT_URL}/verify-email?token=${token}`;

  await resend.emails.send({
    from: 'BandChat <noreply@' + (process.env.RESEND_DOMAIN || 'resend.dev') + '>',
    to: email,
    subject: 'Verify your BandChat email',
    html: `
      <h2>Welcome to BandChat!</h2>
      <p>Click the link below to verify your email address:</p>
      <a href="${verifyUrl}" style="background:#4A154B;color:white;padding:12px 24px;text-decoration:none;border-radius:4px;display:inline-block;">Verify Email</a>
      <p>Or copy this link: ${verifyUrl}</p>
      <p>This link expires in 24 hours.</p>
    `
  });
};

// Generate tokens and store refresh token in database
const generateTokens = async (userId) => {
  const accessToken = jwt.sign(
    { userId },
    process.env.JWT_SECRET,
    { expiresIn: '15m' }
  );

  const refreshToken = jwt.sign(
    { userId, type: 'refresh' },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: '14d' } // Reduced from 30d to 14d for better security
  );

  // Hash refresh token before storing (prevents token theft if DB is breached)
  const hashedToken = hashRefreshToken(refreshToken);

  // Store hashed refresh token in database
  const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000); // 14 days
  await prisma.refreshToken.create({
    data: {
      token: hashedToken,
      userId,
      expiresAt
    }
  });

  return { accessToken, refreshToken };
};

// Sign up
router.post('/signup', authLimiter, async (req, res) => {
  try {
    const { email, password, displayName } = req.body;

    if (!email || !password || !displayName) {
      return res.status(400).json({ error: 'Email, password, and display name are required' });
    }

    // Validate display name
    const displayNameCheck = validateDisplayName(displayName);
    if (!displayNameCheck.valid) {
      return res.status(400).json({ error: displayNameCheck.error });
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
    }

    const existingUser = await prisma.user.findUnique({
      where: { email: email.toLowerCase() }
    });

    if (existingUser) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    const user = await prisma.user.create({
      data: {
        email: email.toLowerCase(),
        password: hashedPassword,
        displayName,
        verificationToken,
        verificationExpires
      },
      select: {
        id: true,
        email: true,
        displayName: true,
        avatarUrl: true,
        emailVerified: true,
        createdAt: true
      }
    });

    // Send verification email (non-blocking)
    sendVerificationEmail(email.toLowerCase(), verificationToken).catch(console.error);

    const tokens = await generateTokens(user.id);

    res.status(201).json({
      user,
      ...tokens,
      message: 'Account created. Please check your email to verify your account.'
    });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ error: 'Failed to create account' });
  }
});

// Verify email
router.post('/verify-email', async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ error: 'Verification token required' });
    }

    const user = await prisma.user.findUnique({
      where: { verificationToken: token }
    });

    if (!user) {
      return res.status(400).json({ error: 'Invalid verification token' });
    }

    if (user.verificationExpires < new Date()) {
      return res.status(400).json({ error: 'Verification token has expired' });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerified: true,
        verificationToken: null,
        verificationExpires: null
      }
    });

    res.json({ message: 'Email verified successfully' });
  } catch (error) {
    console.error('Verification error:', error);
    res.status(500).json({ error: 'Verification failed' });
  }
});

// Resend verification email
router.post('/resend-verification', authLimiter, authenticate, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id }
    });

    if (user.emailVerified) {
      return res.status(400).json({ error: 'Email already verified' });
    }

    const verificationToken = crypto.randomBytes(32).toString('hex');
    const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await prisma.user.update({
      where: { id: user.id },
      data: { verificationToken, verificationExpires }
    });

    await sendVerificationEmail(user.email, verificationToken);

    res.json({ message: 'Verification email sent' });
  } catch (error) {
    console.error('Resend verification error:', error);
    res.status(500).json({ error: 'Failed to resend verification email' });
  }
});

// Login
router.post('/login', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() }
    });

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (!user.password) {
      return res.status(400).json({ error: 'This account uses Google Sign-In. Please sign in with Google.' });
    }

    const validPassword = await bcrypt.compare(password, user.password);

    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const tokens = await generateTokens(user.id);

    res.json({
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl
      },
      ...tokens
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Google Sign-In / Sign-Up
router.post('/google', authLimiter, async (req, res) => {
  try {
    if (!googleClient) {
      return res.status(500).json({ error: 'Google authentication is not configured' });
    }

    const { credential } = req.body;

    if (!credential) {
      return res.status(400).json({ error: 'Google credential required' });
    }

    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const { sub: googleId, email, name, picture, email_verified } = payload;

    // Check if user exists by googleId
    let user = await prisma.user.findUnique({
      where: { googleId }
    });

    if (user) {
      // Existing Google user - just sign in
      const tokens = await generateTokens(user.id);
      return res.json({
        user: {
          id: user.id,
          email: user.email,
          displayName: user.displayName,
          avatarUrl: user.avatarUrl
        },
        ...tokens,
        isNewUser: false
      });
    }

    // Check if email already exists (registered with password)
    const existingUserByEmail = await prisma.user.findUnique({
      where: { email: email.toLowerCase() }
    });

    if (existingUserByEmail) {
      // Link Google account to existing user and sign them in
      const updatedUser = await prisma.user.update({
        where: { id: existingUserByEmail.id },
        data: {
          googleId,
          authProvider: existingUserByEmail.password ? 'both' : 'google',
          emailVerified: true,
          // Update avatar if they don't have one
          ...(picture && !existingUserByEmail.avatarUrl && { avatarUrl: picture })
        },
        select: {
          id: true,
          email: true,
          displayName: true,
          avatarUrl: true
        }
      });

      const tokens = await generateTokens(updatedUser.id);
      return res.json({
        user: updatedUser,
        ...tokens,
        isNewUser: false,
        message: 'Google account linked successfully'
      });
    }

    // Create new user via Google
    user = await prisma.user.create({
      data: {
        email: email.toLowerCase(),
        displayName: name,
        avatarUrl: picture,
        googleId,
        authProvider: 'google',
        emailVerified: email_verified === true,
        password: null
      },
      select: {
        id: true,
        email: true,
        displayName: true,
        avatarUrl: true,
        createdAt: true
      }
    });

    const tokens = await generateTokens(user.id);

    res.status(201).json({
      user,
      ...tokens,
      isNewUser: true,
      message: 'Account created successfully with Google.'
    });

  } catch (error) {
    console.error('Google auth error:', error);
    if (error.message?.includes('Token used too late') ||
        error.message?.includes('Invalid token')) {
      return res.status(401).json({ error: 'Invalid or expired Google token' });
    }
    res.status(500).json({ error: 'Google authentication failed' });
  }
});

// Link Google account to existing local account
router.post('/link-google', authenticate, async (req, res) => {
  try {
    if (!googleClient) {
      return res.status(500).json({ error: 'Google authentication is not configured' });
    }

    const { credential } = req.body;

    if (!credential) {
      return res.status(400).json({ error: 'Google credential required' });
    }

    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const { sub: googleId, email } = payload;

    // Verify the Google email matches the logged-in user's email
    const currentUser = await prisma.user.findUnique({
      where: { id: req.user.id }
    });

    if (currentUser.email.toLowerCase() !== email.toLowerCase()) {
      return res.status(400).json({
        error: 'Google account email does not match your account email'
      });
    }

    // Check if this googleId is already linked to another account
    const existingGoogleUser = await prisma.user.findUnique({
      where: { googleId }
    });

    if (existingGoogleUser && existingGoogleUser.id !== req.user.id) {
      return res.status(409).json({
        error: 'This Google account is already linked to another user'
      });
    }

    // Link the Google account
    const updatedUser = await prisma.user.update({
      where: { id: req.user.id },
      data: {
        googleId,
        authProvider: 'both',
        emailVerified: true
      },
      select: {
        id: true,
        email: true,
        displayName: true,
        avatarUrl: true
      }
    });

    res.json({
      user: updatedUser,
      message: 'Google account linked successfully'
    });

  } catch (error) {
    console.error('Link Google error:', error);
    res.status(500).json({ error: 'Failed to link Google account' });
  }
});

// Refresh token (rate limited to prevent token enumeration)
router.post('/refresh', authLimiter, async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({ error: 'Refresh token required' });
    }

    // Verify JWT signature first
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);

    if (decoded.type !== 'refresh') {
      return res.status(401).json({ error: 'Invalid refresh token' });
    }

    // Hash the token to look it up in database
    const hashedToken = hashRefreshToken(refreshToken);

    // Check if hashed token exists in database (not revoked)
    let storedToken = await prisma.refreshToken.findUnique({
      where: { token: hashedToken }
    });

    if (!storedToken) {
      return res.status(401).json({ error: 'Refresh token has been revoked' });
    }

    if (storedToken.expiresAt < new Date()) {
      // Clean up expired token
      await prisma.refreshToken.delete({ where: { id: storedToken.id } });
      return res.status(401).json({ error: 'Refresh token has expired' });
    }

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        email: true,
        displayName: true,
        avatarUrl: true
      }
    });

    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    // Delete old refresh token (rotation)
    await prisma.refreshToken.delete({ where: { id: storedToken.id } });

    // Generate new tokens
    const tokens = await generateTokens(user.id);

    res.json({
      user,
      ...tokens
    });
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Invalid or expired refresh token' });
    }
    res.status(500).json({ error: 'Token refresh failed' });
  }
});

// Get current user
router.get('/me', authenticate, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        email: true,
        displayName: true,
        avatarUrl: true,
        bio: true,
        createdAt: true,
        workspaces: {
          include: {
            workspace: {
              select: {
                id: true,
                name: true
              }
            }
          }
        }
      }
    });

    res.json(user);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get user' });
  }
});

// Update profile
router.put('/me', authenticate, async (req, res) => {
  try {
    const { displayName, avatarUrl, bio } = req.body;

    // Validate display name if provided
    if (displayName) {
      const displayNameCheck = validateDisplayName(displayName);
      if (!displayNameCheck.valid) {
        return res.status(400).json({ error: displayNameCheck.error });
      }
    }

    // Validate bio length if provided
    if (bio !== undefined && bio !== null && bio.length > 500) {
      return res.status(400).json({ error: 'Bio must be 500 characters or less' });
    }

    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: {
        ...(displayName && { displayName: displayName.trim() }),
        ...(avatarUrl !== undefined && { avatarUrl }),
        ...(bio !== undefined && { bio })
      },
      select: {
        id: true,
        email: true,
        displayName: true,
        avatarUrl: true,
        bio: true
      }
    });

    res.json(user);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// Change password
router.put('/password', authenticate, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!newPassword || newPassword.length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({ error: `New password must be at least ${MIN_PASSWORD_LENGTH} characters` });
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.id }
    });

    // If user has a password, verify current password
    if (user.password) {
      if (!currentPassword) {
        return res.status(400).json({ error: 'Current password is required' });
      }
      const validPassword = await bcrypt.compare(currentPassword, user.password);
      if (!validPassword) {
        return res.status(401).json({ error: 'Current password is incorrect' });
      }
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);

    await prisma.user.update({
      where: { id: req.user.id },
      data: {
        password: hashedPassword,
        authProvider: user.googleId ? 'both' : 'local'
      }
    });

    res.json({ message: 'Password updated successfully' });
  } catch (error) {
    console.error('Password change error:', error);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

// Request email change - sends verification to new email
router.post('/change-email', authenticate, async (req, res) => {
  try {
    const { newEmail, password } = req.body;

    if (!newEmail) {
      return res.status(400).json({ error: 'New email is required' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newEmail)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.id }
    });

    // Require password verification if user has a password
    if (user.password) {
      if (!password) {
        return res.status(400).json({ error: 'Password is required to change email' });
      }
      const validPassword = await bcrypt.compare(password, user.password);
      if (!validPassword) {
        return res.status(401).json({ error: 'Password is incorrect' });
      }
    }

    // Check if new email is already in use
    const existingUser = await prisma.user.findUnique({
      where: { email: newEmail.toLowerCase() }
    });

    if (existingUser) {
      return res.status(400).json({ error: 'Email is already in use' });
    }

    // Generate verification token
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

    // Store the pending email change
    await prisma.user.update({
      where: { id: req.user.id },
      data: {
        verificationToken,
        verificationExpires,
        pendingEmail: newEmail.toLowerCase()
      }
    });

    // Send verification to NEW email
    if (resend) {
      const verifyUrl = `${process.env.CLIENT_URL}/verify-email-change?token=${verificationToken}&email=${encodeURIComponent(newEmail.toLowerCase())}`;

      await resend.emails.send({
        from: 'BandChat <noreply@' + (process.env.RESEND_DOMAIN || 'resend.dev') + '>',
        to: newEmail.toLowerCase(),
        subject: 'Verify your new BandChat email',
        html: `
          <h2>Email Change Request</h2>
          <p>You requested to change your BandChat email address. Click the link below to confirm:</p>
          <a href="${verifyUrl}" style="background:#4A154B;color:white;padding:12px 24px;text-decoration:none;border-radius:4px;display:inline-block;">Verify New Email</a>
          <p>Or copy this link: ${verifyUrl}</p>
          <p>This link expires in 24 hours.</p>
          <p>If you didn't request this change, you can ignore this email.</p>
        `
      });
    } else {
      if (process.env.NODE_ENV !== 'production') {
        console.log('Email not configured. Verification token:', verificationToken);
      }
    }

    res.json({ message: 'Verification email sent to ' + newEmail });
  } catch (error) {
    console.error('Email change request error:', error);
    res.status(500).json({ error: 'Failed to request email change' });
  }
});

// Verify email change
router.post('/verify-email-change', async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ error: 'Token is required' });
    }

    const user = await prisma.user.findUnique({
      where: { verificationToken: token }
    });

    if (!user) {
      return res.status(400).json({ error: 'Invalid verification token' });
    }

    if (user.verificationExpires < new Date()) {
      return res.status(400).json({ error: 'Verification token has expired' });
    }

    if (!user.pendingEmail) {
      return res.status(400).json({ error: 'No pending email change' });
    }

    // Check if email is still available
    const existingUser = await prisma.user.findUnique({
      where: { email: user.pendingEmail }
    });

    if (existingUser) {
      return res.status(400).json({ error: 'Email is already in use' });
    }

    // Update email using server-stored pendingEmail, not client-supplied value
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        email: user.pendingEmail,
        emailVerified: true,
        pendingEmail: null,
        verificationToken: null,
        verificationExpires: null
      },
      select: {
        id: true,
        email: true,
        displayName: true,
        avatarUrl: true
      }
    });

    res.json({ message: 'Email updated successfully', user: updatedUser });
  } catch (error) {
    console.error('Email change verification error:', error);
    res.status(500).json({ error: 'Failed to verify email change' });
  }
});

// Logout - revoke refresh token
router.post('/logout', async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (refreshToken) {
      // Hash the token to find it in database
      const hashedToken = hashRefreshToken(refreshToken);
      // Delete the refresh token from database
      await prisma.refreshToken.deleteMany({
        where: { token: hashedToken }
      });
    }

    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    // Still return success even if token deletion fails
    res.json({ message: 'Logged out successfully' });
  }
});

// Logout all sessions - revoke all refresh tokens for user
router.post('/logout-all', authenticate, async (req, res) => {
  try {
    await prisma.refreshToken.deleteMany({
      where: { userId: req.user.id }
    });

    res.json({ message: 'Logged out of all sessions' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to logout' });
  }
});

// Send password reset email helper
const sendPasswordResetEmail = async (email, token) => {
  if (!resend) {
    if (process.env.NODE_ENV !== 'production') {
      console.log('Email not configured. Password reset token:', token);
    }
    return;
  }

  const resetUrl = `${process.env.CLIENT_URL}/reset-password?token=${token}`;

  await resend.emails.send({
    from: 'BandChat <noreply@' + (process.env.RESEND_DOMAIN || 'resend.dev') + '>',
    to: email,
    subject: 'Reset your BandChat password',
    html: `
      <h2>Password Reset Request</h2>
      <p>You requested to reset your password. Click the link below to set a new password:</p>
      <a href="${resetUrl}" style="background:#4A154B;color:white;padding:12px 24px;text-decoration:none;border-radius:4px;display:inline-block;">Reset Password</a>
      <p>Or copy this link: ${resetUrl}</p>
      <p>This link expires in 1 hour.</p>
      <p>If you didn't request this, you can safely ignore this email.</p>
    `
  });
};

// Forgot password - request reset email
router.post('/forgot-password', authLimiter, async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() }
    });

    // Always return success to prevent email enumeration
    if (!user) {
      return res.json({ message: 'If an account exists with this email, a reset link has been sent.' });
    }

    // Check if user signed up with Google only (no password)
    if (!user.password && user.googleId) {
      return res.json({ message: 'If an account exists with this email, a reset link has been sent.' });
    }

    // Generate reset token and hash it before storage
    const resetToken = crypto.randomBytes(32).toString('hex');
    const hashedResetToken = hashRefreshToken(resetToken);
    const resetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordResetToken: hashedResetToken,
        passwordResetExpires: resetExpires
      }
    });

    // Send unhashed token to user via email
    await sendPasswordResetEmail(user.email, resetToken);

    res.json({ message: 'If an account exists with this email, a reset link has been sent.' });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ error: 'Failed to process request' });
  }
});

// Reset password with token
router.post('/reset-password', authLimiter, async (req, res) => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return res.status(400).json({ error: 'Token and password are required' });
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
    }

    // Hash the incoming token to compare against stored hash
    const hashedToken = hashRefreshToken(token);
    const user = await prisma.user.findFirst({
      where: {
        passwordResetToken: hashedToken,
        passwordResetExpires: { gt: new Date() }
      }
    });

    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }

    // Hash new password and clear reset token
    const hashedPassword = await bcrypt.hash(password, 12);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        passwordResetToken: null,
        passwordResetExpires: null
      }
    });

    // Revoke all refresh tokens for security
    await prisma.refreshToken.deleteMany({
      where: { userId: user.id }
    });

    res.json({ message: 'Password reset successfully. Please log in with your new password.' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

// Verify reset token (check if valid before showing reset form)
router.get('/verify-reset-token', async (req, res) => {
  try {
    const { token } = req.query;

    if (!token) {
      return res.status(400).json({ valid: false, error: 'Token is required' });
    }

    const hashedVerifyToken = hashRefreshToken(token);
    const user = await prisma.user.findFirst({
      where: {
        passwordResetToken: hashedVerifyToken,
        passwordResetExpires: { gt: new Date() }
      }
    });

    if (!user) {
      return res.json({ valid: false, error: 'Invalid or expired reset token' });
    }

    res.json({ valid: true });
  } catch (error) {
    res.status(500).json({ valid: false, error: 'Failed to verify token' });
  }
});

export default router;
