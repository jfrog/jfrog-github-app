# Stage 1: Build the Vue.js client
FROM node:18 AS build

# Set the working directory for the build stage
WORKDIR /app/jfrog-github-app-client

# Copy package.json and package-lock.json for the client
COPY jfrog-github-app-client/package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the client code and build
COPY jfrog-github-app-client ./
RUN npm run build

# Set the working directory for the server
WORKDIR /app
# Copy package.json and package-lock.json for the server
COPY package*.json ./

# Install only production dependencies
RUN npm install --only=production

# Copy the app.js file from the server directory into the /app/dist directory
COPY dist ./

# Copy any other necessary server files (like message.md)
COPY message.md ./

# Expose the port your server will run on
EXPOSE 3000

# Command to run your server from the dist folder
CMD ["node", "app.js"]
