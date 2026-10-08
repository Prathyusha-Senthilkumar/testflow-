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

## Key handling after the 2026-10-08 hardening

- `TESTFLOW_SECRET_KEY` is read through `backend/app/config.py` and is **required**; there is no runtime fallback to the service-role key. The legacy service-role-derived key is still readable only by `scripts/rekey_auth_profiles.py`, so existing rows can be migrated with the steps above. No backward-compatible runtime decryption is needed because upstream already stopped using the fallback at runtime.
- The **worker also needs `TESTFLOW_SECRET_KEY`** (same value). It decrypts `storage_state_enc` and `credentials_enc` in memory (`worker/src/fernet.ts`, same key rules: the value must itself be a Fernet key) and saves renewed sessions back encrypted.
- Decryption failures are explicit. Runs fail with `Test not started: The Auth Profile session could not be decrypted ...`; the API returns 500 with the same reason for Record Test; the profile list shows the session as `expired` / needs renewal and logs `event=auth_profile_decrypt_failed`. Fix by setting the original key, re-running the re-key script, or recording the login again.
- No plaintext `storage_state.json` is written for runs any more. Record Login and Record Test (codegen needs a file path) use a private `0600`, uniquely named `storage_state.<random>.tmp.json` inside the profile folder that is deleted when codegen finishes. Demo mode (`USE_DEMO_DATA=true`) still keeps sessions as local files.
- Earlier versions left plaintext `automation/auth-profiles/<project>/<profile>/storage_state.json` files behind. Once the profiles show a session in Supabase mode, delete them: `find automation/auth-profiles -name storage_state.json -delete`.
