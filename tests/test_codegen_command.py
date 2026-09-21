from automation.framework.recorder import build_codegen_command


def test_codegen_command_includes_save_storage():
    command = build_codegen_command(
        browser="chromium",
        url="https://example.com/login",
        save_storage="automation/auth-profiles/demo/auth-1/storage_state.json",
    )
    assert "--save-storage" in command
    assert "automation/auth-profiles/demo/auth-1/storage_state.json" in command
    assert "--output" not in command
    assert command[-1] == "https://example.com/login"


def test_codegen_command_includes_load_storage():
    command = build_codegen_command(
        browser="chromium",
        url="https://example.com/dashboard",
        target="python-pytest",
        output="automation/generated/demo/case/test_recorded.py",
        load_storage="automation/auth-profiles/demo/auth-1/storage_state.json",
    )
    assert "--load-storage" in command
    assert "--output" in command
    assert command[-1] == "https://example.com/dashboard"
