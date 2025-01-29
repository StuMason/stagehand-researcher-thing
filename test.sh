curl -X POST http://localhost:3333/browser \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://stuartmason.co.uk",
    "action": "click the about page link",
    "extract": "get all the content from the page"
}'