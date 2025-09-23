from ddgs import DDGS
import json
from openai import OpenAI
from constants import QUERY_STRING, OPENAI_MODEL, PRODUCT_NAME
from prompt import getPrompt

client = OpenAI()

results = DDGS().text(QUERY_STRING, max_results=10, backend="lite")
jsonResults = json.dumps(results)

response = client.responses.create(
    model=OPENAI_MODEL,
    instructions=getPrompt(PRODUCT_NAME),
    input=jsonResults,
)


def removeJsonBlock(text):
    return text.replace("```json\n", "").replace("\n```", "")


print(json.dumps(results))
print(
    response.output_text,
)
