"""One-time migration from the legacy service-role-derived Fernet key.

Run from backend/ only after setting SUPABASE_* and a NEW valid
TESTFLOW_SECRET_KEY. The script never prints plaintext or ciphertext and is
idempotent: fields already decryptable with the new key are skipped.
"""
from __future__ import annotations

import sys
from pathlib import Path

# Allow `python scripts/rekey_auth_profiles.py` from backend/.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.database import get_supabase_client
from app.services.secret_store import (
    SecretUnavailableError,
    decrypt_mapping_legacy,
    encrypt_mapping,
    is_configured,
    try_decrypt_mapping,
)


def main() -> int:
    if not is_configured():
        raise SecretUnavailableError(
            "Set TESTFLOW_SECRET_KEY to the new stable Fernet key before re-keying."
        )
    db = get_supabase_client()
    if db is None:
        raise RuntimeError("Supabase mode is required for re-keying.")
    rows = (
        db.from_("auth_profiles")
        .select("id,credentials_enc,storage_state_enc")
        .execute()
        .data
        or []
    )
    migrated_fields = skipped_fields = absent_fields = failed_fields = 0
    failed_profiles: set[str] = set()
    for row in rows:
        profile_id = str(row.get("id") or "")
        updates: dict[str, str] = {}
        for column in ("credentials_enc", "storage_state_enc"):
            token = str(row.get(column) or "").strip()
            if not token:
                absent_fields += 1
                continue
            if try_decrypt_mapping(token) is not None:
                skipped_fields += 1
                continue
            payload = decrypt_mapping_legacy(token)
            if payload is None:
                failed_fields += 1
                failed_profiles.add(profile_id)
                continue
            updates[column] = encrypt_mapping(payload)
        if updates:
            db.from_("auth_profiles").update(updates).eq("id", profile_id).execute()
            verify = (
                db.from_("auth_profiles")
                .select("credentials_enc,storage_state_enc")
                .eq("id", profile_id)
                .limit(1)
                .execute()
                .data
                or []
            )
            if not verify:
                raise RuntimeError(f"Could not verify re-keyed profile {profile_id}")
            for column in updates:
                if try_decrypt_mapping(str(verify[0].get(column) or "")) is None:
                    raise RuntimeError(f"New-key verification failed for {profile_id}:{column}")
                migrated_fields += 1
    print(f"Profiles scanned: {len(rows)}")
    print(f"Fields re-keyed: {migrated_fields}")
    print(f"Fields already on new key: {skipped_fields}")
    print(f"Fields absent: {absent_fields}")
    print(f"Fields failed: {failed_fields}")
    if failed_profiles:
        print("Profiles with failures: " + ", ".join(sorted(failed_profiles)))
        return 2
    print("Re-key complete. Runtime decryption now uses TESTFLOW_SECRET_KEY only.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
