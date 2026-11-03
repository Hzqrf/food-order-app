"""Phone numbers in owner reports are shown partly hidden. The full number never leaves the server."""

HIDDEN_AT_LEAST = 3


def mask_phone(e164: str) -> str:
    """'+60123456789' -> '012-***6789'. At least three digits stay hidden, so a 9-digit landline shows
    its last three ('041-***567'). Too short to mask meaningfully -> '***'."""
    digits = "0" + e164.removeprefix("+60") if e164.startswith("+60") else e164.lstrip("+")
    if len(digits) < 7:
        return "***"
    tail = min(4, len(digits) - 3 - HIDDEN_AT_LEAST)
    return f"{digits[:3]}-***{digits[-tail:]}"
