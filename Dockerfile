# Use an official PHP runtime as a base image
FROM php:7.4-apache

# Copy your project files into the container
COPY . /var/www/html/

# Set the working directory
WORKDIR /var/www/html/

# Expose port 8080
EXPOSE 8080
