import pytest

from automation.framework.url_resolve import normalize_start_path, resolve_start_url

SRM = "https://www.srmist.edu.in"


@pytest.mark.parametrize(
    "start_path,expected",
    [
        ("/", f"{SRM}/"),
        ("/academics/", f"{SRM}/academics/"),
        ("academics/", f"{SRM}/academics/"),
        ("/admission-india/", f"{SRM}/admission-india/"),
    ],
)
def test_resolve_start_url_srm(start_path, expected):
    assert resolve_start_url(SRM, start_path) == expected


def test_resolve_start_url_base_with_trailing_slash():
    assert resolve_start_url(f"{SRM}/", "/admission-india/") == f"{SRM}/admission-india/"


def test_no_double_slash_in_path():
    assert "//" not in resolve_start_url(SRM, "//academics/").replace("://", "")


def test_normalize_start_path_relative():
    assert normalize_start_path("academics/") == "/academics/"
    assert normalize_start_path("/") == "/"
