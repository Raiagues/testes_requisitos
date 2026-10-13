#!/usr/bin/env python3
"""Compatibilidade com o comando original: o build editável usa codigo/."""
from pathlib import Path
import subprocess
subprocess.run(["npm", "run", "build"], cwd=Path(__file__).parent, check=True)
