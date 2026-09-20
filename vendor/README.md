# niimbot-web-bluetooth 2.6.0

Source: https://github.com/iscarelli/niimbot-web-bluetooth/tree/v2.6.0

`niimbot.js` is vendored without modifications from `src/niimbot.js` at tag `v2.6.0`.
SHA-256: `5ed9ead4797d575374bef078573eb2196da839f04a5f7bd30886990e865ea6aa`.

License: MIT, copyright (c) 2026 iscarelli; see `NIIMBOT-LICENSE`.
No scripts are downloaded or executed remotely at runtime.

## qrcode-generator 1.4.4

Source: https://github.com/kazuhikoarase/qrcode-generator/tree/v1.4.4

`qrcode-generator.js` is vendored from the npm package at version `1.4.4`.
SHA-256: `18ae399f81182bc9de916e9c77b195df20cc58d6f2d55a62b085a299f1bf1780`.

It creates the QR matrix locally so the label renderer can draw it into the same
black-and-white canvas sent to the printer. The package is MIT licensed; see
`QRCODE-GENERATOR-LICENSE`.

D11_H model ID: 528. Protocol task: `v4`, 300 dpi, 144-dot printhead.
https://github.com/iscarelli/niimbot-web-bluetooth/blob/v2.6.0/registry.json

Connection is reused while the document and BLE connection are alive. The upstream
driver calls the Chrome chooser again after disconnection / document reload. Do not
promise unattended reconnects across those boundaries.
