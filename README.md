# Copyright © 2026 Kumbisaly Heritage Hotel and Restaurant. All rights reserved.

## Legal Notice and Terms of Use

### Unauthorized Use Prohibited
This application, including its source code, design architecture, database schemas, and business logic, is the exclusive property of Kumbisaly Heritage Hotel and Restaurant. Any unauthorized copying, distribution, modification, reverse engineering, or deployment of this software, in whole or in part, is strictly prohibited.

### Consent Requirements
Explicit written consent from the founder of Kumbisaly Heritage Hotel and Restaurant is mandatory for any use, reproduction, or adaptation of this application. Failure to obtain such consent constitutes a violation of intellectual property rights.

### Legal Consequences
Violators will be subject to legal action to the fullest extent permitted by law, which may include civil liability for damages, injunctive relief, and criminal prosecution where applicable.

## Intellectual Property Disclaimer

All intellectual property rights associated with this application are reserved. This protection extends to, but is not limited to:
- **Application Code:** The underlying source code in all programming languages used.
- **Design Elements:** User interface (UI) designs, user experience (UX) flows, and graphical assets.
- **Business Logic:** Proprietary algorithms, data processing workflows, and operational methodologies.
- **Proprietary Technologies:** Custom-built modules, integrations, and architectural frameworks.

## Credits

**Lead Development**
This application was architected and developed by:

**Mr. Felix Akabati**
*Full-Stack Developer & Founder, Akatech IT Solutions*

**Contact Information:**
- Phone: +233244027477

---

## Project Overview

This is a Next.js application that uses Neon (Serverless Postgres) for backend data storage and authentication.

## Requirements

- Node.js 18+ (recommend LTS)
- npm or pnpm
- A Neon project with `DATABASE_URL`

## Environment Configuration

1. Create a `.env.local` file in the project root.
2. Copy values from `.env.example` and set at minimum:
   - `DATABASE_URL`
3. Optional: configure additional variables used by the app as needed.

For detailed setup, refer to `SETUP_GUIDE.md`.

## Run Locally

```bash
npm install
npm run dev
```

Visit `http://localhost:3000/` in your browser.

## Build and Start (Production)

```bash
npm run build
npm start
```

## Neon Integration

- Database schema and migrations are in `database-schema.sql`.
- Database connection is handled via `@neondatabase/serverless`.

## Troubleshooting

- Use `/env-test` and `/env-debug` routes to verify environment configuration.
- Check `SETUP_GUIDE.md` and `BUGS_FIXED.md` for common issues and fixes.

## Notes

- Docker and Docker Compose have been removed. All backend functionality relies on Neon Serverless Postgres.

---
**Last Updated:** January 08, 2026
