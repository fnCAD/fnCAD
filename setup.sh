#!/bin/bash

# Create public_html if it doesn't exist
mkdir -p ~/public_html

# Remove existing symlink or directory if it exists
rm -rf ~/public_html/fncad

# Create symlink from dist to public_html/fncad
ln -s "$(pwd)/dist" ~/public_html/fncad

echo "Symlink created. Run 'npm run build' to update the site."
