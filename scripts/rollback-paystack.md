# Rollback Steps to Restore Paystack

1. Restore deleted files:
   - lib/services/paystack-service.ts
   - app/api/paystack/initialize/route.ts
   - app/api/paystack/verify/route.ts
   - app/api/paystack/refund/route.ts
2. Revert changes in lib/services/payment-service.ts to re-enable mobile/card flow and polling.
3. Re-add PAYSTACK\_\* environment variables to your env files.
4. Update documentation to reflect Paystack availability.
5. Re-run tests and start the dev server.
