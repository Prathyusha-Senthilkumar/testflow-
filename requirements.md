# Manager Requirements Mapped to the Implementation

## 1. "Write a framework, not Playwright scripts"
Implemented a reusable `framework/` package:
- `config_loader.py` reads/writes metadata.
- `validator.py` validates test configuration and paths.
- `runner.py` runs any configured test through the same flow.
- `result_handler.py` updates Pass/Fail and keeps result history.
- `recorder.py` launches Playwright Codegen.
- `cli.py` exposes one consistent command-line interface.

The existing Playwright test remains an input to the framework, not the framework itself.

## 2. "Validation - tell users what's going to happen"
Before execution, the framework:
1. checks all required metadata fields;
2. confirms the test script exists;
3. confirms the Markdown test case exists;
4. prints application name, test case, test script, execution engine, and expected result update;
5. asks the user to confirm before execution.

## 3. Required `data.json` format
The metadata format is preserved exactly, using the public SRM website tests:

```json
{
    "title": "SRM Homepage Test",
    "test_file_location": "tests/homepage/test_homepage.py",
    "test_case_location": "tests/homepage/test_case.md",
    "test_result": "Not Run"
}
```

The framework is currently scoped to `https://www.srmist.edu.in/`; Student Portal/login tests are not part of this version.

## 4. "See how to record and playback in Playwright"
The framework exposes Playwright Codegen through:

```bash
python run_tests.py record --title "<Test Title>" --output tests/<name>/test_<name>.py
```

This records user interactions into Python pytest code. Playback happens by configuring that generated file in `data.json` and running it through:

```bash
python run_tests.py run --config tests/<name>/data.json
```

## 5. Test result storage
After execution:
- `data.json` is updated to `Pass` or `Fail`.
- `result_history.json` records each run with timestamp and pytest return code.

## 6. Existing work preserved
Existing Playwright scripts and placeholder test files were kept. No fake automation was added for features that were still empty.
