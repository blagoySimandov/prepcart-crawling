from typing import Final

PRODUCT_NAME: Final[str] = "Leffe Бира 0.33 Л"
QUERY_STRING: Final[str] = (
    f"site:https://prices.nedostavka.net/bg/product {PRODUCT_NAME}"
)
OPENAI_MODEL: Final[str] = "gpt-4o"
