FROM node:18-slim
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm install --production
COPY . .
RUN mkdir -p /usr/src/app/uploads /usr/src/app/logs  
EXPOSE 3001
CMD ["npm", "start"]