"""Phone numbers in owner reports are shown partly hidden. The full number never leaves the server."""


def mask_phone(e164: str) -> str:
    """'+60123456789' -> '012-***6789'. Too short to mask meaningfully -> '***'."""
    digits = "0" + e164.removeprefix("+60") if e164.startswith("+60") else e164.lstrip("+")
    if len(digits) < 7:
        return "***"
    return f"{digits[:3]}-***{digits[-4:]}"
