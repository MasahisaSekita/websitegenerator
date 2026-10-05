#!/bin/zsh
# Starts the website generator: it builds the websites that dashboard Generate buttons ask for.
cd "${0:A:h}"
python3 tools/site_runner.py doctor
echo "Website generator running. Generate buttons in the dashboard are built here. Press Ctrl+C to stop."
exec python3 tools/site_runner.py watch
