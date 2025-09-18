import json
import re
import argparse
import sys


def extract_products(file_path):
    """
    Reads a file containing JavaScript data, extracts, cleans,
    and prints product information.
    """
    # Try to open and read the specified file
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            js_data = f.read()
    except FileNotFoundError:
        print(f"❌ Error: File not found at '{file_path}'")
        sys.exit(1)
    except Exception as e:
        print(f"❌ An error occurred while reading the file: {e}")
        sys.exit(1)

    # Use a regular expression to find and extract the main 'return' object.
    # re.DOTALL allows '.' to match newline characters.
    match = re.search(r"return\s*(\{.*\});", js_data, re.DOTALL)

    if not match:
        print("❌ Error: Could not find the product data object in the file.")
        sys.exit(1)

    json_string = match.group(1)

    # Clean the string to make it valid JSON by removing the 'n' suffix from BigInts
    json_string = re.sub(r"(\d+)n", r"\1", json_string)

    # Parse the cleaned string into a Python dictionary
    try:
        data = json.loads(json_string)
    except json.JSONDecodeError as e:
        print(f"❌ Error parsing the data. It might not be valid JSON. Details: {e}")
        sys.exit(1)

    # Navigate through the nested structure to find the list of products
    try:
        product_elements = data["data"][1]["initialData"]["body"][0]["data"]["elements"]
    except (KeyError, IndexError, TypeError):
        print(
            "❌ Error: The data structure is not as expected. Could not locate the product list."
        )
        sys.exit(1)

    # Loop through the elements and print details for each product
    product_count = 0
    print("--- 🛍️ Extracted Products ---")
    for element in product_elements:
        if element.get("type") == "PRODUCT_TILE":
            product_data = element.get("data", {})

            # Extract individual product details, with fallbacks for missing data
            name = product_data.get("name", "N/A")
            price_info = product_data.get("priceInfo", {})
            price = price_info.get("amount", "N/A")
            currency = price_info.get("currencyCode", "")
            description = product_data.get(
                "description", "No description available."
            ).strip()
            image_url = product_data.get("imageUrl", "N/A")

            # Check if there is a promotion
            promo_info = product_data.get("promotion")

            product_count += 1
            print(f"\n## {product_count}. {name}")

            if promo_info:
                promo_price_info = promo_info.get("priceInfo", {})
                promo_price = promo_price_info.get("amount")
                if promo_price is not None:
                    print(f"  - **Original Price:** {price} {currency}")
                    print(f"  - **Promo Price:** {promo_price} {currency} ✨")
                else:
                    print(f"  - **Price:** {price} {currency}")
            else:
                print(f"  - **Price:** {price} {currency}")

            print(f"  - **Description:** {description}")
            print(f"  - **Image URL:** {image_url}")

    print("\n" + "=" * 40)
    print(f"✅ Extraction complete. Found {product_count} products.")


if __name__ == "__main__":
    # Set up the command-line argument parser
    parser = argparse.ArgumentParser(
        description="Extract product data from a Glovo-like JS data structure file."
    )
    parser.add_argument(
        "file_path", help="The path to the file containing the JavaScript data."
    )

    args = parser.parse_args()
    extract_products(args.file_path)
