"""Build a credential-free distribution from an explicit file allowlist."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

ROOT = Path(__file__).resolve().parent
FILES = [
    'manifest.json', 'label.js', 'api.js', 'background.js', 'content.js',
    'options.html', 'options.css', 'options.js', 'sample.js', 'README.md', 'LICENSE',
    'vendor/niimbot.js', 'vendor/NIIMBOT-LICENSE', 'vendor/README.md',
]
output = ROOT / 'dist' / 'brewfather-niimbot-0.1.0.zip'
output.parent.mkdir(exist_ok=True)
with ZipFile(output, 'w', ZIP_DEFLATED) as bundle:
    for name in FILES:
        bundle.write(ROOT / name, f'brewfather-niimbot/{name}')
print(output)
