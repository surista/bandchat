# Contributing to BandChat

Thank you for your interest in contributing to BandChat! This document provides guidelines and instructions for contributing.

## Table of Contents

- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Code Style](#code-style)
- [Commit Messages](#commit-messages)
- [Pull Requests](#pull-requests)
- [Testing](#testing)
- [Reporting Issues](#reporting-issues)

---

## Development Setup

### Prerequisites

- Node.js 18+
- PostgreSQL 14+
- npm or yarn

### Getting Started

1. **Clone the repository**
   ```bash
   git clone https://github.com/surista/bandchat.git
   cd bandchat
   ```

2. **Set up environment variables**
   ```bash
   # Server
   cp server/.env.example server/.env
   # Edit server/.env with your database credentials and secrets

   # Client
   cp client/.env.example client/.env
   # Edit client/.env if using non-default API URL
   ```

3. **Install dependencies**
   ```bash
   # Server
   cd server && npm install

   # Client
   cd ../client && npm install
   ```

4. **Set up the database**
   ```bash
   cd server
   npx prisma db push
   ```

5. **Start development servers**
   ```bash
   # Terminal 1 - Server
   cd server && npm run dev

   # Terminal 2 - Client
   cd client && npm run dev
   ```

6. **Access the app**
   - Client: http://localhost:5173
   - Server: http://localhost:3001

### Optional Services

Some features require additional configuration:

| Feature | Required Config |
|---------|-----------------|
| Google Sign-In | `GOOGLE_CLIENT_ID` |
| Image Uploads | Cloudinary credentials |
| Push Notifications | VAPID keys |
| Email | Resend API key |
| Song Metadata | YouTube API key |

See `server/.env.example` for all options.

---

## Project Structure

```
bandchat/
├── client/                 # React frontend (Vite)
│   ├── src/
│   │   ├── components/     # React components
│   │   │   ├── auth/       # Authentication pages
│   │   │   ├── band/       # Band management features
│   │   │   ├── channels/   # Channel & sidebar
│   │   │   ├── common/     # Shared components
│   │   │   ├── messages/   # Messaging components
│   │   │   ├── navigation/ # Mobile navigation
│   │   │   ├── threads/    # Thread view
│   │   │   └── workspaces/ # Workspace management
│   │   ├── context/        # React Context providers
│   │   ├── services/       # API client & utilities
│   │   └── styles/         # CSS files
│   └── styles/             # Global CSS
│
├── server/                 # Express backend
│   ├── prisma/
│   │   └── schema.prisma   # Database schema
│   └── src/
│       ├── lib/            # Prisma client
│       ├── middleware/     # Auth & rate limiting
│       ├── routes/         # API endpoints
│       ├── services/       # External API integrations
│       └── socket/         # Socket.IO handlers
│
├── API.md                  # API documentation
├── ARCHITECTURE.md         # System design docs
├── CHANGELOG.md            # Version history
└── README.md               # Project overview
```

---

## Code Style

### General

- Use **ES6+** syntax (arrow functions, destructuring, etc.)
- Use **async/await** over Promises
- Keep functions small and focused
- Avoid deeply nested code (early returns preferred)

### JavaScript/React

```javascript
// Component structure
function MyComponent({ prop1, prop2 }) {
  // 1. Hooks
  const [state, setState] = useState(null);
  const { user } = useAuth();

  // 2. Effects
  useEffect(() => {
    // ...
  }, [dependency]);

  // 3. Handlers
  const handleClick = () => {
    // ...
  };

  // 4. Render
  return (
    <div>...</div>
  );
}
```

### Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Components | PascalCase | `MessageList.jsx` |
| Functions | camelCase | `handleSubmit` |
| Constants | UPPER_SNAKE | `API_URL` |
| CSS Classes | kebab-case | `modal-content` |
| Files | PascalCase (components), camelCase (utils) | `ChannelView.jsx`, `api.js` |

### CSS/Tailwind

- Use Tailwind utility classes for styling
- Create custom classes in `styles/main.css` for reusable patterns
- Use CSS variables for theme colors (defined in `main.css`)
- Mobile-first: use responsive prefixes (`sm:`, `md:`, `lg:`)

```jsx
// Good: Responsive, uses theme variables
<button className="px-4 py-2 bg-slack-green hover:bg-green-600 rounded md:px-6">
  Submit
</button>

// Avoid: Hardcoded colors, no responsive consideration
<button style={{ backgroundColor: '#2eb67d' }}>
  Submit
</button>
```

### API Routes

```javascript
// Route handler structure
router.post('/resource', authenticate, async (req, res) => {
  try {
    // 1. Validate input
    const { field } = req.body;
    if (!field) {
      return res.status(400).json({ error: 'Field is required' });
    }

    // 2. Check permissions
    const membership = await prisma.workspaceMember.findUnique({...});
    if (!membership) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    // 3. Perform action
    const result = await prisma.resource.create({...});

    // 4. Emit socket event if needed
    const io = req.app.get('io');
    io.to(`workspace:${workspaceId}`).emit('resource:created', result);

    // 5. Return response
    res.status(201).json(result);
  } catch (error) {
    console.error('Create resource error:', error);
    res.status(500).json({ error: 'Failed to create resource' });
  }
});
```

---

## Commit Messages

We follow a simple version-prefixed format:

```
v1.02.XX: brief description of changes

Optional longer description if needed.
Multiple lines are fine.

Co-Authored-By: Your Name <email@example.com>
```

### Examples

```
v1.02.85: add song search functionality

v1.02.86: fix notification badge not clearing on channel click

v1.02.87: improve mobile touch targets, add dvh modal heights

- Increase button padding for better tap targets
- Use dynamic viewport height for modals
- Add form autocomplete for mobile keyboards
```

### Commit Guidelines

- **One feature/fix per commit** - Keep commits focused
- **Bump version in package.json** - Update `client/package.json` version
- **Update CHANGELOG.md** - Add entry for significant changes
- **Test before committing** - Ensure the app builds and runs

---

## Pull Requests

### Before Submitting

1. **Pull latest main**
   ```bash
   git checkout main
   git pull origin main
   git checkout -b feature/your-feature
   ```

2. **Make your changes**
   - Follow code style guidelines
   - Add comments for complex logic
   - Test on both desktop and mobile viewports

3. **Verify changes**
   ```bash
   # Client builds successfully
   cd client && npm run build

   # Server starts without errors
   cd server && npm run dev
   ```

4. **Update documentation if needed**
   - Add new endpoints to `API.md`
   - Update `README.md` for new features
   - Add entry to `CHANGELOG.md`

### PR Description Template

```markdown
## Summary
Brief description of what this PR does.

## Changes
- Added X feature
- Fixed Y bug
- Updated Z component

## Testing
- [ ] Tested on desktop (Chrome, Firefox)
- [ ] Tested on mobile viewport
- [ ] API endpoints tested
- [ ] No console errors

## Screenshots
(If UI changes)
```

---

## Testing

### Manual Testing Checklist

Before submitting changes, test:

**Authentication**
- [ ] Login/logout works
- [ ] Session persists on refresh
- [ ] Protected routes redirect properly

**Messaging**
- [ ] Messages send and appear in real-time
- [ ] Threads work correctly
- [ ] Reactions add/remove properly
- [ ] Attachments upload and display

**Mobile**
- [ ] Touch targets are 44px minimum
- [ ] Modals don't overflow viewport
- [ ] Bottom nav is accessible
- [ ] Forms work with mobile keyboards

**Band Features** (if changed)
- [ ] Songs create/edit/delete
- [ ] Setlists build correctly
- [ ] Gigs save and display
- [ ] Statistics calculate correctly

---

## Reporting Issues

### Bug Reports

Include:
1. **Steps to reproduce** - Numbered steps to trigger the bug
2. **Expected behavior** - What should happen
3. **Actual behavior** - What actually happens
4. **Environment** - Browser, OS, screen size
5. **Screenshots/videos** - If applicable
6. **Console errors** - Copy any JavaScript errors

### Feature Requests

Include:
1. **Problem** - What pain point does this solve?
2. **Solution** - How do you envision it working?
3. **Alternatives** - Other approaches considered
4. **Priority** - Nice-to-have vs. critical

---

## Questions?

Open an issue or start a discussion. We're happy to help!
