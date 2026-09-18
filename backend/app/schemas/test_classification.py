from typing import Literal

TestCaseCategory = Literal["Functional", "Responsive"]
TestCaseScenario = Literal["Happy Path", "Negative", "Edge Case"]

DEFAULT_TEST_CASE_CATEGORY: TestCaseCategory = "Functional"
DEFAULT_TEST_CASE_SCENARIO: TestCaseScenario = "Happy Path"
