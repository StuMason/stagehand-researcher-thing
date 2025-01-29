cd $FORGE_SITE_PATH
npm install
npm run build
pm2 reload browser-service || pm2 start server.js --name browser-service