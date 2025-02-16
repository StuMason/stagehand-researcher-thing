curl -X POST http://localhost:3333/browser \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://stuartmason.co.uk",
    "action": "click the about page link",
    "extract": "get all the content from the page"
}'

curl -X POST http://localhost:3333/research \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Iggy Hammick",
    "context": "Designer, founder of dark blue"
  }'

curl -X POST http://localhost:3333/research \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Ben Lipscombe",
    "context": "UK Based PPC Specialist"
  }'

  curl -X POST http://localhost:3333/research \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Ali Gallop",
    "context": "Video Producer, founder of theres this place"
  }'

  curl -X POST http://localhost:3333/research \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Daniel Ruffles",
    "context": "UK based brand and design expert"
  }'
