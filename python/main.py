import requests
import re
import json
import ast


def convert_bigint_to_string(js_code: str) -> str:
    """
    Convert JavaScript BigInt literals (numbers ending with 'n') to strings.
    This handles the format: 123n -> "123"
    """
    # Pattern to match BigInt literals (numbers followed by 'n')
    bigint_pattern = r"\b(\d+)n\b"

    # Replace all BigInt literals with quoted strings
    converted = re.sub(bigint_pattern, r'"\1"', js_code)

    return converted


def extract_json_from_js_function(js_code: str) -> dict:
    """
    Extract JSON data from a JavaScript function wrapper.
    Specifically handles Glovo's format: (function(a,b){...return {...}}({},{}))
    """
    # Try to extract the return statement first
    return_pattern = r"return\s+(\{(?:[^{}]|\{[^{}]*\})*\})"
    match = re.search(return_pattern, js_code, re.DOTALL)

    if match:
        json_str = match.group(1)

        # Clean up the JSON string
        json_str = convert_bigint_to_string(json_str)
        json_str = re.sub(r"\bundefined\b", "null", json_str)
        json_str = re.sub(r"\bvoid\s+0\b", "null", json_str)
        json_str = re.sub(r"new\s+Set\s*\([^)]*\)", "[]", json_str)

        # Fix unquoted keys
        json_str = re.sub(r'(?<!")(\b[a-zA-Z_][a-zA-Z0-9_]*)\s*:', r'"\1":', json_str)
        json_str = re.sub(r'"("[\w]+"):', r"\1:", json_str)

        # Remove trailing commas
        json_str = re.sub(r",\s*([\]}])", r"\1", json_str)

        try:
            return json.loads(json_str)
        except json.JSONDecodeError:
            pass

    # If that doesn't work, try to extract the parameters being set
    # For Glovo's case: a.code = "SOF", b.code = "BG", etc.
    # And combine them with the returned object

    # Extract variable assignments
    assignments = {}
    assignment_pattern = r"([a-zA-Z_][a-zA-Z0-9_]*)\.([\w]+)\s*=\s*([^;]+);"
    for match in re.finditer(assignment_pattern, js_code):
        var_name = match.group(1)
        prop_name = match.group(2)
        value = match.group(3).strip()

        if var_name not in assignments:
            assignments[var_name] = {}

        # Try to parse the value
        try:
            # Clean up the value
            value = convert_bigint_to_string(value)
            value = re.sub(r"\bundefined\b", "null", value)
            value = re.sub(r"\bvoid\s+0\b", "null", value)

            # Try to evaluate as JSON
            if value.startswith(("{", "[", '"')):
                assignments[var_name][prop_name] = json.loads(value)
            elif value == "null" or value == "true" or value == "false":
                assignments[var_name][prop_name] = json.loads(value)
            elif value.replace(".", "").replace("-", "").isdigit():
                assignments[var_name][prop_name] = (
                    float(value) if "." in value else int(value)
                )
            else:
                assignments[var_name][prop_name] = value.strip("\"'")
        except:
            assignments[var_name][prop_name] = value

    # Try to find the return object and merge with assignments
    return_simple = r"return\s+\{([^}]+)\}"
    match = re.search(return_simple, js_code, re.DOTALL)

    if match:
        return_content = match.group(1)
        # Parse the return content
        result = {}

        # Simple key-value pairs in return statement
        kv_pattern = r'"([^"]+)"\s*:\s*([^,}]+)'
        for kv_match in re.finditer(kv_pattern, return_content):
            key = kv_match.group(1)
            value = kv_match.group(2).strip()

            # Check if value is a variable reference
            if value in assignments:
                result[key] = assignments[value]
            else:
                try:
                    result[key] = json.loads(value)
                except:
                    result[key] = value

        return result if result else assignments

    return assignments


def extract_nuxt_data(html_content: str) -> dict:
    """
    Extract __NUXT_ data from HTML content and parse it as JSON.
    """
    # Pattern to find __NUXT_ assignment
    pattern = r"__NUXT__\s*=\s*(.*?)(?:</script>|\n\s*</script>)"

    match = re.search(pattern, html_content, re.DOTALL)

    if not match:
        # Try alternative pattern with different formatting
        pattern = r"window\.__NUXT__\s*=\s*(.*?)(?:</script>|\n\s*</script>)"
        match = re.search(pattern, html_content, re.DOTALL)

    if not match:
        raise ValueError("Could not find __NUXT__ data in the HTML")

    # Get the JavaScript code
    js_code = match.group(1).strip()

    # Remove trailing semicolon if present
    if js_code.endswith(";"):
        js_code = js_code[:-1]

    # Handle function wrapper
    if js_code.startswith("(function"):
        print("Detected function wrapper, extracting data...")
        return extract_json_from_js_function(js_code)

    # Standard JSON extraction
    # Convert BigInt literals to strings
    js_code = convert_bigint_to_string(js_code)

    # Handle undefined values
    js_code = re.sub(r"\bundefined\b", "null", js_code)
    js_code = re.sub(r"\bvoid\s+0\b", "null", js_code)

    # Handle new Set([])
    js_code = re.sub(r"new\s+Set\s*\([^)]*\)", "[]", js_code)

    # Handle unquoted object keys
    js_code = re.sub(r'(?<!")(\b[a-zA-Z_][a-zA-Z0-9_]*)\s*:', r'"\1":', js_code)
    js_code = re.sub(r'"("[\w]+"):', r"\1:", js_code)

    # Remove trailing commas
    js_code = re.sub(r",\s*([\]}])", r"\1", js_code)

    try:
        # Parse the JSON
        data = json.loads(js_code)
        return data
    except json.JSONDecodeError as e:
        # Save the problematic code for debugging
        with open("debug_js_code.txt", "w", encoding="utf-8") as f:
            f.write("Original extracted code:\n")
            f.write(match.group(1).strip()[:5000])  # First 5000 chars for debugging
            f.write("\n\nProcessed code:\n")
            f.write(js_code[:5000])  # First 5000 chars

        # Try alternative: look for specific data structures
        print("Standard parsing failed, attempting pattern-based extraction...")

        # Look for products array
        products_pattern = r'"products"\s*:\s*(\[[^\]]*\])'
        products_match = re.search(products_pattern, js_code)
        if products_match:
            try:
                products = json.loads(products_match.group(1))
                return {"products": products}
            except:
                pass

        # Look for any valid JSON object
        json_obj_pattern = r"\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}"
        for obj_match in re.finditer(json_obj_pattern, js_code):
            try:
                obj = json.loads(obj_match.group(0))
                if obj and len(str(obj)) > 100:  # If we found something substantial
                    return obj
            except:
                continue

        raise ValueError(
            f"Could not parse __NUXT__ data. Debug output saved to debug_js_code.txt"
        )


def fetch_glovo_data(url: str) -> dict:
    """
    Fetch data from Glovo URL with browser-like headers.
    """
    # Browser-like headers to mimic a real browser request
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9,bg;q=0.8",
        "Accept-Encoding": "gzip, deflate, br",
        "DNT": "1",
        "Connection": "keep-alive",
        "Upgrade-Insecure-Requests": "1",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Sec-Fetch-User": "?1",
        "Cache-Control": "max-age=0",
        "Referer": "https://glovoapp.com/bg/bg/sofiya/",
    }

    # Make the request
    print(f"Fetching data from: {url}")
    response = requests.get(url, headers=headers)
    response.raise_for_status()

    print(f"Response received, size: {len(response.text)} characters")

    # Extract __NUXT__ data
    nuxt_data = extract_nuxt_data(response.text)

    return nuxt_data


def main():
    url = "https://glovoapp.com/bg/bg/sofiya/billa-sof1?content=nay-prodavani-ts"

    try:
        # Fetch and parse the data
        data = fetch_glovo_data(url)

        # Save to JSON file
        with open("products.json", "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

        print("✓ Data successfully saved to products.json")

        # Print some basic info about the data
        if isinstance(data, dict):
            print(
                f"  - Top-level keys: {list(data.keys())[:10]}{'...' if len(data.keys()) > 10 else ''}"
            )

            # Try to find and report on products
            if "layout" in data and "data" in data:
                print("  - Found 'layout' and 'data' keys (Nuxt structure)")

                # Look for products in the data
                if isinstance(data.get("data"), list):
                    for item in data["data"]:
                        if isinstance(item, dict):
                            # Check for products in various possible locations
                            if "body" in item:
                                body_items = item["body"]
                                if isinstance(body_items, list):
                                    for body_item in body_items:
                                        if (
                                            isinstance(body_item, dict)
                                            and "data" in body_item
                                        ):
                                            elements = body_item.get("data", {}).get(
                                                "elements", []
                                            )
                                            product_count = sum(
                                                1
                                                for e in elements
                                                if isinstance(e, dict)
                                                and e.get("type") == "PRODUCT_TILE"
                                            )
                                            if product_count > 0:
                                                print(
                                                    f"  - Found {product_count} products in the data"
                                                )
                                                break
        elif isinstance(data, list):
            print(f"  - Array with {len(data)} items")

        print("\n✓ Check products.json for the full extracted data")

    except requests.RequestException as e:
        print(f"✗ Error fetching the page: {e}")
    except ValueError as e:
        print(f"✗ Error parsing data: {e}")
        print("  Check debug_js_code.txt for the raw JavaScript code")
    except Exception as e:
        print(f"✗ Unexpected error: {e}")
        import traceback

        traceback.print_exc()


if __name__ == "__main__":
    main()
