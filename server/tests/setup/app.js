import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env.test before anything else
config({ path: resolve(__dirname, '../../.env.test') });

import { createApp } from '../../src/app.js';

// Create app once and reuse across all tests
const app = createApp();

// Mock io object so routes that use req.app.get('io') don't crash
app.set('io', {
  to: () => ({ emit: () => {} }),
  emit: () => {},
  in: () => ({ emit: () => {} }),
});

export default app;
