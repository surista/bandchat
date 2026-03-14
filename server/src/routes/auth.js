import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { Resend } from 'resend';
import { OAuth2Client } from 'google-auth-library';
import { authenticate } from '../middleware/auth.js';
import { apiLimiter, authLimiter, tokenLimiter, refreshLimiter, exportLimiter } from '../middleware/rateLimit.js';
import prisma from '../lib/prisma.js';
import { isAllowedUploadUrl } from '../lib/validateUrl.js';

const router = express.Router();
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const googleClient = process.env.GOOGLE_CLIENT_ID ? new OAuth2Client(process.env.GOOGLE_CLIENT_ID) : null;

const APPLE_BUNDLE_ID = process.env.APPLE_BUNDLE_ID || 'com.bandchat.mobile';
const APPLE_ISSUER = 'https://appleid.apple.com';
const APPLE_JWKS_URL = 'https://appleid.apple.com/auth/keys';

let appleKeysCache = null;
let appleKeysCacheTime = 0;
const APPLE_KEYS_TTL = 24 * 60 * 60 * 1000;

const getApplePublicKeys = async () => {
  if (appleKeysCache && Date.now() - appleKeysCacheTime < APPLE_KEYS_TTL) {
    return appleKeysCache;
  }
  const response = await fetch(APPLE_JWKS_URL);
  if (!response.ok) {
    throw new Error('Failed to fetch Apple public keys');
  }
  const data = await response.json();
  appleKeysCache = data.keys;
  appleKeysCacheTime = Date.now();
  return appleKeysCache;
};

const verifyAppleIdentityToken = async (identityToken) => {
  const header = JSON.parse(Buffer.from(identityToken.split('.')[0], 'base64url').toString());
  const keys = await getApplePublicKeys();
  const key = keys.find(k => k.kid === header.kid);
  if (!key) {
    throw new Error('Apple public key not found for kid: ' + header.kid);
  }

  const publicKey = crypto.createPublicKey({ key, format: 'jwk' });
  const pem = publicKey.export({ type: 'spki', format: 'pem' });

  return jwt.verify(identityToken, pem, {
    algorithms: ['RS256'],
    issuer: APPLE_ISSUER,
    audience: APPLE_BUNDLE_ID
  });
};

// Minimum password length (increased from 6 to 8 for better security)
const MIN_PASSWORD_LENGTH = 8;

/**
 * Validates password complexity beyond minimum length.
 * Requires at least one uppercase letter, one lowercase letter, and one number.
 * @param {string} password - The password to validate
 * @returns {{valid: boolean, error?: string}}
 */
const validatePasswordComplexity = (password) => {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { valid: false, error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` };
  }
  if (password.length > 128) {
    return { valid: false, error: 'Password must be 128 characters or less' };
  }
  if (!/[A-Z]/.test(password)) {
    return { valid: false, error: 'Password must contain at least one uppercase letter' };
  }
  if (!/[a-z]/.test(password)) {
    return { valid: false, error: 'Password must contain at least one lowercase letter' };
  }
  if (!/[0-9]/.test(password)) {
    return { valid: false, error: 'Password must contain at least one number' };
  }
  return { valid: true };
};

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
 * Set the refresh token as an httpOnly cookie on the response.
 * Used by web clients for secure token storage.
 * Mobile clients ignore this cookie and use the body-based token.
 * @param {import("express").Response} res - Express response
 * @param {string} refreshToken - The refresh token to set
 */
const setRefreshTokenCookie = (res, refreshToken) => {
  const isProduction = process.env.NODE_ENV === 'production';
  res.cookie('refreshToken', refreshToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax', // 'none' required for cross-origin Railway deployment
    maxAge: 14 * 24 * 60 * 60 * 1000, // 14 days
    path: '/api/auth'
  });
};

/**
 * Clear the refresh token cookie from the response.
 * @param {import("express").Response} res - Express response
 */
const clearRefreshTokenCookie = (res) => {
  const isProduction = process.env.NODE_ENV === 'production';
  res.clearCookie('refreshToken', {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    path: '/api/auth'
  });
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
      console.log('Email not configured. Verification email would be sent to:', email);
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
    { userId, type: 'refresh', jti: crypto.randomUUID() },
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

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    // Validate display name
    const displayNameCheck = validateDisplayName(displayName);
    if (!displayNameCheck.valid) {
      return res.status(400).json({ error: displayNameCheck.error });
    }

    const passwordCheck = validatePasswordComplexity(password);
    if (!passwordCheck.valid) {
      return res.status(400).json({ error: passwordCheck.error });
    }

    const existingUser = await prisma.user.findUnique({
      where: { email: email.toLowerCase() }
    });

    if (existingUser) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const hashedVerificationToken = hashRefreshToken(verificationToken);
    const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    const user = await prisma.user.create({
      data: {
        email: email.toLowerCase(),
        password: hashedPassword,
        displayName,
        verificationToken: hashedVerificationToken,
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

    // Set refresh token as httpOnly cookie for web clients
    setRefreshTokenCookie(res, tokens.refreshToken);

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
router.post('/verify-email', tokenLimiter, async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ error: 'Verification token required' });
    }

    // Hash the incoming token to compare against stored hash
    const hashedToken = hashRefreshToken(token);
    const user = await prisma.user.findUnique({
      where: { verificationToken: hashedToken }
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
    const hashedVerificationToken = hashRefreshToken(verificationToken);
    const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await prisma.user.update({
      where: { id: user.id },
      data: { verificationToken: hashedVerificationToken, verificationExpires }
    });

    // Send unhashed token in the email URL
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
      return res.status(400).json({ error: 'This account uses third-party Sign-In. Use "Forgot Password" to set a password for email login.' });
    }

    const validPassword = await bcrypt.compare(password, user.password);

    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const tokens = await generateTokens(user.id);

    // Set refresh token as httpOnly cookie for web clients
    setRefreshTokenCookie(res, tokens.refreshToken);

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
      // Set refresh token as httpOnly cookie for web clients
      setRefreshTokenCookie(res, tokens.refreshToken);
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
      // Account exists with this email - require user to log in first and link via Settings
      return res.status(409).json({
        error: 'Account exists with this email. Please log in with your password first, then link your Google account in Settings.',
        code: 'ACCOUNT_EXISTS'
      });
    }

    // Create new user via Google — validate display name
    const googleDisplayName = name ? name.trim().substring(0, 50) : email.split('@')[0];
    const googleNameCheck = validateDisplayName(googleDisplayName);
    const safeDisplayName = googleNameCheck.valid ? googleDisplayName : email.split('@')[0];

    user = await prisma.user.create({
      data: {
        email: email.toLowerCase(),
        displayName: safeDisplayName,
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

    // Set refresh token as httpOnly cookie for web clients
    setRefreshTokenCookie(res, tokens.refreshToken);

    res.status(201).json({
      user,
      ...tokens,
      isNewUser: true,
      message: 'Account created successfully with Google.'
    });

  } catch (error) {
    console.error('Google auth error:', error.message);
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
        avatarUrl: true,
        authProvider: true,
        googleId: true,
        appleId: true,
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

// Apple Sign-In / Sign-Up
router.post('/apple', authLimiter, async (req, res) => {
  try {
    const { identityToken, fullName } = req.body;

    if (!identityToken || typeof identityToken !== 'string') {
      return res.status(400).json({ error: 'Apple identity token required' });
    }

    if (identityToken.length > 5000) {
      return res.status(400).json({ error: 'Invalid identity token' });
    }

    const payload = await verifyAppleIdentityToken(identityToken);
    const { sub: appleId, email, email_verified } = payload;

    let user = await prisma.user.findUnique({
      where: { appleId }
    });

    if (user) {
      const tokens = await generateTokens(user.id);
      setRefreshTokenCookie(res, tokens.refreshToken);
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

    const existingUserByEmail = await prisma.user.findUnique({
      where: { email: email.toLowerCase() }
    });

    if (existingUserByEmail) {
      return res.status(409).json({
        error: 'Account exists with this email. Please sign in with your password and link Apple from settings.',
        code: 'ACCOUNT_EXISTS'
      });
    }

    let displayName = email.split('@')[0];
    if (fullName && (fullName.givenName || fullName.familyName)) {
      const parts = [fullName.givenName, fullName.familyName].filter(Boolean);
      if (parts.length > 0) {
        const combined = parts.join(' ').trim().substring(0, 50);
        const nameCheck = validateDisplayName(combined);
        if (nameCheck.valid) {
          displayName = combined;
        }
      }
    }

    user = await prisma.user.create({
      data: {
        email: email.toLowerCase(),
        displayName,
        appleId,
        authProvider: 'apple',
        emailVerified: email_verified === true || email_verified === 'true',
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
    setRefreshTokenCookie(res, tokens.refreshToken);

    res.status(201).json({
      user,
      ...tokens,
      isNewUser: true,
      message: 'Account created successfully with Apple.'
    });

  } catch (error) {
    console.error('Apple auth error:', error);
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Invalid or expired Apple token' });
    }
    res.status(500).json({ error: 'Apple authentication failed' });
  }
});

// Link Apple account to existing account
router.post('/link-apple', authenticate, async (req, res) => {
  try {
    const { identityToken } = req.body;

    if (!identityToken || typeof identityToken !== 'string') {
      return res.status(400).json({ error: 'Apple identity token required' });
    }

    if (identityToken.length > 5000) {
      return res.status(400).json({ error: 'Invalid identity token' });
    }

    const payload = await verifyAppleIdentityToken(identityToken);
    const { sub: appleId } = payload;

    const currentUser = await prisma.user.findUnique({
      where: { id: req.user.id }
    });

    if (currentUser.appleId) {
      return res.status(400).json({ error: 'Apple account already linked' });
    }

    const existingAppleUser = await prisma.user.findUnique({
      where: { appleId }
    });

    if (existingAppleUser && existingAppleUser.id !== req.user.id) {
      return res.status(409).json({
        error: 'This Apple account is already linked to another user'
      });
    }

    const updatedUser = await prisma.user.update({
      where: { id: req.user.id },
      data: {
        appleId,
        authProvider: 'both',
        emailVerified: true
      },
      select: {
        id: true,
        email: true,
        displayName: true,
        avatarUrl: true,
        authProvider: true,
        googleId: true,
        appleId: true,
      }
    });

    res.json({
      user: updatedUser,
      message: 'Apple account linked successfully'
    });

  } catch (error) {
    console.error('Link Apple error:', error);
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Invalid or expired Apple token' });
    }
    res.status(500).json({ error: 'Failed to link Apple account' });
  }
});

// Refresh token (rate limited to prevent token enumeration)
router.post('/refresh', refreshLimiter, async (req, res) => {
  try {
    // Check httpOnly cookie first (web clients), then fall back to body (mobile clients)
    const refreshToken = req.cookies?.refreshToken || req.body.refreshToken;

    if (!refreshToken) {
      return res.status(400).json({ error: 'Refresh token required' });
    }

    // Verify JWT signature first
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET, { algorithms: ['HS256'] });

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

    // Set new refresh token as httpOnly cookie for web clients
    setRefreshTokenCookie(res, tokens.refreshToken);

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
        authProvider: true,
        googleId: true,
        appleId: true,
        password: true,
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

    // Don't send the actual password hash — just whether they have one
    const { password, ...userData } = user;
    res.json({ ...userData, hasPassword: !!password });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get user' });
  }
});

// Update profile
router.put('/me', authenticate, apiLimiter, async (req, res) => {
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

    // Validate avatarUrl if provided
    if (avatarUrl !== undefined && avatarUrl !== null && avatarUrl !== '') {
      const check = isAllowedUploadUrl(avatarUrl, { allowGoogle: true });
      if (!check.valid) {
        return res.status(400).json({ error: check.error || 'Invalid avatar URL' });
      }
    }

    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: {
        ...(displayName && { displayName: displayName.trim() }),
        ...(avatarUrl !== undefined && { avatarUrl: avatarUrl || null }),
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
router.put('/password', authenticate, authLimiter, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!newPassword) {
      return res.status(400).json({ error: 'New password is required' });
    }
    const passwordCheck = validatePasswordComplexity(newPassword);
    if (!passwordCheck.valid) {
      return res.status(400).json({ error: passwordCheck.error });
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
        authProvider: (user.googleId || user.appleId) ? 'both' : 'local'
      }
    });

    await prisma.refreshToken.deleteMany({ where: { userId: req.user.id } });

    res.json({ message: 'Password updated successfully' });
  } catch (error) {
    console.error('Password change error:', error);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

// Request email change - sends verification to new email
router.post('/change-email', authenticate, authLimiter, async (req, res) => {
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

    // Require password verification for email changes
    if (!user.password) {
      return res.status(400).json({ error: 'Please set a password on your account before changing your email' });
    }
    if (!password) {
      return res.status(400).json({ error: 'Password is required to change email' });
    }
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Password is incorrect' });
    }

    // Check if new email is already in use
    const existingUser = await prisma.user.findUnique({
      where: { email: newEmail.toLowerCase() }
    });

    if (existingUser) {
      return res.status(400).json({ error: 'Email is already in use' });
    }

    // Generate verification token and hash before storage
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const hashedVerificationToken = hashRefreshToken(verificationToken);
    const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

    // Store the pending email change with hashed token
    await prisma.user.update({
      where: { id: req.user.id },
      data: {
        verificationToken: hashedVerificationToken,
        verificationExpires,
        pendingEmail: newEmail.toLowerCase()
      }
    });

    // Send unhashed token to NEW email
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
        console.log('Email not configured. Email change verification would be sent to:', newEmail);
      }
    }

    res.json({ message: 'Verification email sent to ' + newEmail });
  } catch (error) {
    console.error('Email change request error:', error);
    res.status(500).json({ error: 'Failed to request email change' });
  }
});

// Verify email change
router.post('/verify-email-change', tokenLimiter, async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ error: 'Token is required' });
    }

    // Hash the incoming token to compare against stored hash
    const hashedToken = hashRefreshToken(token);
    const user = await prisma.user.findUnique({
      where: { verificationToken: hashedToken }
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
    // Check cookie first (web clients), then fall back to body (mobile clients)
    const refreshToken = req.cookies?.refreshToken || req.body.refreshToken;

    if (refreshToken) {
      // Hash the token to find it in database
      const hashedToken = hashRefreshToken(refreshToken);
      // Delete the refresh token from database
      await prisma.refreshToken.deleteMany({
        where: { token: hashedToken }
      });
    }

    // Clear the httpOnly cookie for web clients
    clearRefreshTokenCookie(res);

    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    // Clear cookie even on error
    clearRefreshTokenCookie(res);
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

    clearRefreshTokenCookie(res);
    res.json({ message: 'Logged out of all sessions' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to logout' });
  }
});

// Send password reset email helper
const sendPasswordResetEmail = async (email, token) => {
  if (!resend) {
    if (process.env.NODE_ENV !== 'production') {
      console.log('Email not configured. Password reset email would be sent.');
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

    const passwordCheck = validatePasswordComplexity(password);
    if (!passwordCheck.valid) {
      return res.status(400).json({ error: passwordCheck.error });
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

    const updateData = {
      password: hashedPassword,
      passwordResetToken: null,
      passwordResetExpires: null
    };

    if (user.authProvider === 'google' || user.authProvider === 'apple') {
      updateData.authProvider = 'both';
    }

    await prisma.user.update({
      where: { id: user.id },
      data: updateData
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
router.get('/verify-reset-token', tokenLimiter, async (req, res) => {
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

// Delete account (Discord-style: anonymize messages, preserve content)
router.delete('/account', authenticate, authLimiter, async (req, res) => {
  try {
    const { password } = req.body;
    const userId = req.user.id;

    // Load full user
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Identity verified via JWT (authenticate middleware)
    // Password verification removed per App Store guideline 5.1.1(v):
    // "Allow users to complete account deletion without extra steps"

    // Check sole-admin constraint
    const adminMemberships = await prisma.workspaceMember.findMany({
      where: { userId, role: 'ADMIN' },
      include: { workspace: { select: { id: true, name: true } } }
    });

    const soleAdminWorkspaces = [];
    for (const membership of adminMemberships) {
      const otherAdmins = await prisma.workspaceMember.count({
        where: {
          workspaceId: membership.workspaceId,
          role: 'ADMIN',
          userId: { not: userId }
        }
      });
      if (otherAdmins === 0) {
        soleAdminWorkspaces.push(membership.workspace.name);
      }
    }

    if (soleAdminWorkspaces.length > 0) {
      return res.status(400).json({
        error: 'You are the only admin in these workspaces. Transfer admin role before deleting your account.',
        workspaces: soleAdminWorkspaces
      });
    }

    // Capture workspace IDs for post-deletion notifications
    const workspaceIds = adminMemberships.length > 0
      ? adminMemberships.map(m => m.workspaceId)
      : (await prisma.workspaceMember.findMany({
          where: { userId },
          select: { workspaceId: true }
        })).map(m => m.workspaceId);

    // Soft-delete: mark as deleted, revoke sessions (anonymization deferred to purge)
    await prisma.$transaction([
      // Set deletedAt timestamp
      prisma.user.update({
        where: { id: userId },
        data: { deletedAt: new Date() }
      }),
      // Revoke all refresh tokens so they can't log back in
      prisma.refreshToken.deleteMany({ where: { userId } })
    ]);

    // Notify workspaces about the removed member
    const io = req.app.get('io');
    if (io) {
      workspaceIds.forEach(wsId => {
        io.to(`workspace:${wsId}`).emit('member:removed', { userId });
      });
      // Force-logout and disconnect the deleted user's active sockets
      io.to(`user:${userId}`).emit('force:logout');
      const sockets = await io.in(`user:${userId}`).fetchSockets();
      for (const s of sockets) {
        s.disconnect(true);
      }
    }

    // Clear the httpOnly cookie for web clients
    clearRefreshTokenCookie(res);

    res.json({ message: 'Account scheduled for deletion. You have 30 days to contact support to restore it.' });
  } catch (error) {
    console.error('Delete account error:', error);
    res.status(500).json({ error: 'Failed to delete account' });
  }
});

// Export user data as JSON download
router.get('/export', authenticate, exportLimiter, async (req, res) => {
  try {
    const userId = req.user.id;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true, email: true, displayName: true, bio: true, avatarUrl: true,
        authProvider: true, createdAt: true,
        workspaces: {
          include: {
            workspace: { select: { id: true, name: true } }
          }
        },
        messages: {
          select: {
            id: true, content: true, createdAt: true,
            channel: { select: { name: true, isDirect: true, workspace: { select: { name: true } } } },
            attachments: { select: { filename: true, url: true, type: true, size: true } }
          },
          orderBy: { createdAt: 'desc' },
          take: 10000
        },
        songs: {
          select: { id: true, title: true, artist: true, key: true, bpm: true, duration: true, createdAt: true,
            workspace: { select: { name: true } } }
        },
        setlists: {
          select: { id: true, name: true, performedAt: true, venue: true, createdAt: true,
            workspace: { select: { name: true } } }
        },
        gigs: {
          select: { id: true, title: true, date: true, venue: true, type: true, status: true, createdAt: true,
            workspace: { select: { name: true } } }
        },
        availability: {
          select: { date: true, status: true, note: true,
            workspace: { select: { name: true } } }
        },
        memberAchievements: {
          select: { earnedAt: true, metadata: true,
            achievement: { select: { name: true, description: true, icon: true } },
            workspace: { select: { name: true } } }
        },
        pollVotes: {
          select: { createdAt: true,
            option: { select: { text: true, poll: { select: { question: true } } } } }
        },
        reactions: {
          select: { emoji: true, message: { select: { id: true, content: true } } }
        }
      }
    });

    if (!user) return res.status(404).json({ error: 'User not found' });

    // Fetch additional user-scoped data not included in the main query
    const [contacts, practiceSessions, savedMessages, blockedUsers, pinnedMessages] = await Promise.all([
      prisma.contact.findMany({
        where: { createdById: userId },
        select: { name: true, category: true, email: true, phone: true, website: true, notes: true, createdAt: true,
          workspace: { select: { name: true } } }
      }),
      prisma.practiceSession.findMany({
        where: { userId },
        select: { duration: true, notes: true, practicedAt: true,
          song: { select: { title: true, artist: true } },
          workspace: { select: { name: true } } }
      }),
      prisma.savedMessage.findMany({
        where: { userId },
        select: { createdAt: true,
          message: { select: { id: true, content: true, createdAt: true,
            channel: { select: { name: true, workspace: { select: { name: true } } } } } } }
      }),
      prisma.blockedUser.findMany({
        where: { blockerId: userId },
        select: { createdAt: true,
          blockedUser: { select: { displayName: true } } }
      }),
      prisma.pinnedMessage.findMany({
        where: { pinnedById: userId },
        select: { createdAt: true,
          message: { select: { id: true, content: true } },
          channel: { select: { name: true, workspace: { select: { name: true } } } } }
      }),
    ]);

    const messagesTruncated = user.messages.length >= 10000;
    const exportData = {
      exportDate: new Date().toISOString(),
      ...(messagesTruncated && { note: 'Messages limited to most recent 10,000. Contact support for full export.' }),
      profile: {
        id: user.id, email: user.email, displayName: user.displayName,
        bio: user.bio, avatarUrl: user.avatarUrl, authProvider: user.authProvider,
        createdAt: user.createdAt
      },
      workspaces: user.workspaces.map(m => ({
        name: m.workspace.name, role: m.role, joinedAt: m.joinedAt
      })),
      messages: user.messages.map(m => ({
        content: m.content, channelName: m.channel.name, isDirect: m.channel.isDirect,
        workspaceName: m.channel.workspace.name, createdAt: m.createdAt,
        attachments: m.attachments
      })),
      songsCreated: user.songs.map(s => ({
        title: s.title, artist: s.artist, key: s.key, bpm: s.bpm,
        duration: s.duration, workspaceName: s.workspace.name, createdAt: s.createdAt
      })),
      setlistsCreated: user.setlists.map(s => ({
        name: s.name, performedAt: s.performedAt, venue: s.venue,
        workspaceName: s.workspace.name, createdAt: s.createdAt
      })),
      gigsCreated: user.gigs.map(g => ({
        title: g.title, date: g.date, venue: g.venue, type: g.type,
        status: g.status, workspaceName: g.workspace.name, createdAt: g.createdAt
      })),
      availability: user.availability.map(a => ({
        date: a.date, status: a.status, note: a.note,
        workspaceName: a.workspace.name
      })),
      achievements: user.memberAchievements.map(a => ({
        name: a.achievement.name, description: a.achievement.description,
        icon: a.achievement.icon, earnedAt: a.earnedAt,
        workspaceName: a.workspace.name
      })),
      pollVotes: user.pollVotes.map(v => ({
        question: v.option.poll.question, answer: v.option.text, votedAt: v.createdAt
      })),
      reactions: user.reactions.map(r => ({
        emoji: r.emoji, messageContent: r.message?.content
      })),
      contacts: contacts.map(c => ({
        name: c.name, category: c.category, email: c.email, phone: c.phone,
        website: c.website, notes: c.notes, workspaceName: c.workspace.name, createdAt: c.createdAt
      })),
      practiceSessions: practiceSessions.map(p => ({
        songTitle: p.song.title, songArtist: p.song.artist, duration: p.duration,
        notes: p.notes, practicedAt: p.practicedAt, workspaceName: p.workspace.name
      })),
      savedMessages: savedMessages.map(s => ({
        messageContent: s.message.content, messageCreatedAt: s.message.createdAt,
        channelName: s.message.channel?.name, workspaceName: s.message.channel?.workspace?.name,
        savedAt: s.createdAt
      })),
      blockedUsers: blockedUsers.map(b => ({
        blockedUserName: b.blockedUser.displayName, blockedAt: b.createdAt
      })),
      pinnedMessages: pinnedMessages.map(p => ({
        messageContent: p.message.content, channelName: p.channel.name,
        workspaceName: p.channel.workspace?.name, pinnedAt: p.createdAt
      }))
    };

    const dateStr = new Date().toISOString().split('T')[0];
    const sanitizedEmail = user.email.replace(/[^a-zA-Z0-9]/g, '_');
    res.setHeader('Content-Disposition', `attachment; filename="bandchat-export-${sanitizedEmail}-${dateStr}.json"`);
    res.setHeader('Content-Type', 'application/json');
    res.json(exportData);
  } catch (error) {
    console.error('Export user data error:', error);
    res.status(500).json({ error: 'Failed to export data' });
  }
});

export default router;
