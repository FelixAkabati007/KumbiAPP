#!/usr/bin/env node

/**
 * Environment Setup Script for KHHREST
 * This script helps you create a .env.local file with proper defaults
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

console.log("🚀 KHHREST Environment Setup\n");

// Check if .env.local already exists
const envPath = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  console.log("⚠️  .env.local already exists!");
  console.log("   If you want to overwrite it, delete the file first.\n");
  process.exit(0);
}

// Generate secure defaults
const generateSecureKey = (length = 32) => {
  return crypto.randomBytes(length).toString("base64");
};

// Create environment content
const envContent = `# KHHREST Environment Configuration
# Generated on ${new Date().toISOString()}

# =============================================================================
# PUBLIC VARIABLES (Available in browser)
# =============================================================================
NEXT_PUBLIC_API_URL=http://localhost:3000/api
NEXT_PUBLIC_APP_NAME=KHHREST
NEXT_PUBLIC_APP_VERSION=1.0.0

# =============================================================================
# DATABASE & BACKEND (Required for production)
# =============================================================================
# Neon Configuration - Connection String from Neon Dashboard
DATABASE_URL=postgresql://username:password@ep-host.region.neon.tech/neondb?sslmode=require

# =============================================================================
# SECURITY (Auto-generated for development)
# =============================================================================
JWT_SECRET=${generateSecureKey(32)}
SESSION_SECRET=${generateSecureKey(32)}

# =============================================================================
# PAYMENT PROCESSING (Optional)
# =============================================================================
STRIPE_SECRET_KEY=sk_test_your-stripe-secret-key
STRIPE_PUBLISHABLE_KEY=pk_test_your-stripe-publishable-key

# =============================================================================
# EMAIL CONFIGURATION (Optional)
# =============================================================================
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password

# =============================================================================
# CACHING (Optional)
# =============================================================================
REDIS_URL=redis://localhost:6379

# =============================================================================
# FEATURE FLAGS (Optional - defaults to false)
# =============================================================================
ENABLE_ANALYTICS=false
ENABLE_NOTIFICATIONS=true
ENABLE_THERMAL_PRINTER=true
ENABLE_BARCODE_SCANNER=true
ENABLE_CASH_DRAWER=true

# =============================================================================
# BUILD & DEPLOYMENT
# =============================================================================
NODE_ENV=development
CI=false
`;

// Write the file
try {
  fs.writeFileSync(envPath, envContent);
  console.log("✅ Successfully created .env.local file!");
  console.log("");
  console.log("📝 Next steps:");
  console.log("   1. Update the DATABASE_URL with your Neon connection string");
  console.log("   2. Set up payment processing keys if needed");
  console.log("   3. Configure email settings if needed");
  console.log("   4. Restart your development server");
  console.log("");
  console.log("🔗 For detailed instructions, see: docs/environment-setup.md");
  console.log("🔍 Test your configuration at: http://localhost:3000/env-test");
  console.log("");
  console.log("⚠️  Remember: Never commit .env.local to version control!");
} catch (error) {
  console.error("❌ Error creating .env.local file:", error.message);
  process.exit(1);
}
