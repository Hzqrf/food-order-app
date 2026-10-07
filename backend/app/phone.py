import re

_DIGITS = re.compile(r"\D")


def normalize_my_phone(raw: str) -> str | None:
    """Malaysian numbers to +60 format. '012-345 6789' -> '+60123456789'. None if not plausible."""
    digits = _DIGITS.sub("", raw or "")
    if digits.startswith("60"):
        digits = digits[2:]
    elif digits.startswith("0"):
        digits = digits[1:]
    # Mobile numbers are 1x + 7 or 8 digits; landlines are 8 or 9 digits after the trunk 0.
    if not (8 <= len(digits) <= 10) or digits.startswith("0"):
        return None
    return f"+60{digits}"
