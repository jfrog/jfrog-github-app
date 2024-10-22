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

# Stage 2: Serve the Node.js server
FROM node:18 AS production

# Set the working directory for the server
WORKDIR /app

# Copy package.json and package-lock.json for the server
COPY package*.json ./

# Install only production dependencies
RUN npm install --only=production

# Copy the built Vue.js app from the build stage to the server directory
COPY --from=build /app/jfrog-github-app-client/dist ./jfrog-github-app-client/dist

# Copy the message.md file from the server directory into the /app directory
COPY message.md ./

# Copy the entire dist directory (if needed for other files)
COPY dist ./

# List files in the /app directory for debugging (optional)

# Expose the port your server will run on
EXPOSE 3000

# Command to run your server
CMD ["node", "app.js"]
