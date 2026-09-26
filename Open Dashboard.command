#!/bin/zsh
cd "${0:A:h}"
exec python3 tools/control.py serve --port 4310
