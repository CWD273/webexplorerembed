FROM php:7.4-apache

# Copy project files
COPY . /var/www/html/

# Set working directory
WORKDIR /var/www/html/

# Enable mod_rewrite (optional, if needed)
RUN a2enmod rewrite

# Expose default Apache port
EXPOSE 80
