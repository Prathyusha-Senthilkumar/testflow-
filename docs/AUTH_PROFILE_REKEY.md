# Auth Profile Fernet re-key

The runtime now uses `TESTFLOW_SECRET_KEY` only. Existing Supabase rows that were encrypted with the former service-role-derived key must be re-keyed once before the backend is restarted with this code.

1. Back up the three existing local `automation/auth-profiles` folders and do not delete them yet.
2. Generate one Fernet key and keep it stable (do not commit it):
   `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`
3. Put that value in the host/root `.env` as `TESTFLOW_SECRET_KEY=...`. Keep the existing Supabase URL/service-role secret available during this one-time migration.
4. From `backend`, with the same environment loaded, run `python scripts/rekey_auth_profiles.py`.
5. The script reports counts only; it never prints secrets. It skips fields already encrypted with the new key and verifies every rewritten field with the new key.
6. Rebuild/recreate the backend with the same `TESTFLOW_SECRET_KEY`, list the profiles, and run an authenticated test.

Do not rotate or remove `TESTFLOW_SECRET_KEY` without another explicit re-key operation. The Supabase service-role secret is no longer used by normal Auth Profile encryption/decryption.
