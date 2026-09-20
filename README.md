# Brewfather → Niimbot D11H

A local Chrome Manifest V3 extension that adds one **Print label** button to the
header of every batch card in the Brewfather Batches list. Clicking it opens a
preview; the preview panel controls the copy count and the final print action.
Recipes and batches are never changed.

The default label is **40 × 14 mm**, one copy, print density 3. Label length, tape
width, density, and feed position can be changed in the settings. The copy count
is selected in the preview panel for each print job. The target printer is
**Niimbot D11_H, 300 dpi**, rather than the older 203 dpi D11.

## Install the unpacked extension

1. Download this repository with **Code → Download ZIP**, or clone it with
   `git clone https://github.com/andreypopov/brewfather-niimbot.git`.
2. Open `chrome://extensions` in Chrome on macOS or Windows.
3. Enable **Developer mode** and click **Load unpacked**.
4. Select the downloaded or cloned repository folder, the folder that contains
   `manifest.json`.
5. Open the extension settings from its card with **Details → Extension options**.
6. Choose your existing `.env.local` file in the file picker, or enter the Brewfather
   User ID and API key manually. The API key needs **Read Batches** permission.
7. Click **Save settings** and reload the Brewfather tab. Buttons will appear in Batches.

The repository also contains a ready-to-download package at
`dist/brewfather-niimbot-0.2.0.zip`. Chrome's **Load unpacked** expects a folder,
so unzip the package first and select the extracted `brewfather-niimbot` folder.

The package can be rebuilt with:

```sh
python3 package.py
```

## Print a label

- Load the label roll you want and turn on the D11H near the computer.
- Close the NIIMBOT phone app if it is holding the Bluetooth connection.
- Click **Print label** on a batch card to open its preview.
- Set **Copies** (1 by default), click **Print**, and select `D11_H` in Chrome's
  Bluetooth chooser.
- If macOS asks, allow Chrome to use Bluetooth.
- While the tab and connection stay open, later jobs can print from the preview
  panel without choosing the device again.

After a tab reload, printer shutdown, or Bluetooth disconnect, Chrome may ask you to
choose the device again. This version does not provide background reconnect after
Chrome closes. No separate server or NIIMBOT app is required for printing.

## Data shown on the label

The recipe name and style come from the recipe copy stored in the batch. Metrics are
read from the batch: `measuredAbv`, `measuredOg`, `measuredFg`, and `estimatedIbu`.
When a measured value is missing or explicitly unset, the batch estimate is used,
then the estimate from its recipe copy. Estimated OG/FG and ABV based on incomplete
measurements are marked with **≈**; missing values are shown as **—**. IBU is the
recipe's estimated bitterness. The bottom line contains the batch number and brew
date in the `Europe/London` time zone.

For batch #119 on 20 September 2026, the label preview is:

```text
Citra American Pale Ale - 50 L
American Pale Ale
ABV ≈4.7%   IBU 47
OG 1.046   FG ≈1.010
#119 · 31.08.2026
```

This batch has no measured FG, so its estimated FG and ABV are not presented as final
measurements. Once a final FG is entered in Brewfather, the next print request uses it.

Brewfather 3.1.0 does not expose a public batch ID in the list-card DOM. The extension
reads the visible batch number and full recipe name, matches them against the list
from the official API, and fetches the selected batch again before printing. If more
than one match exists, printing stops safely; open the individual batch, where the ID
is present in the page URL. The list index is cached for five minutes, while batch
metrics are fetched fresh for every print.

## Label geometry and connection

- 40 mm along the feed direction is 472 dots at 300 dpi.
- The D11H print head is 144 dots wide (about 12.2 mm), even on 14–15 mm tape.
- The readable 472 × 144 layout is rotated to 144 × 472 before it is sent over BLE.
- The initial feed offset is zero and has not been calibrated for a particular roll.
- Long lines are reduced to fit. If the text still does not fit, the preview reports
  the shortened line and printing asks you to choose a longer label.
- Double clicks are blocked. Web Locks prevents simultaneous jobs from separate
  Brewfather tabs. After an error, printing always starts with a deliberate new click.

## Access and dependencies

The key is stored in `chrome.storage.local`, is not synced, and is never exposed to
the page's content scripts. Requests go only to `https://api.brewfather.app/` and use
GET. The extension does not edit batches, recipes, or inventory. There are no third-
party servers or analytics services.

The extension includes the MIT-licensed
[niimbot-web-bluetooth 2.6.0](https://github.com/iscarelli/niimbot-web-bluetooth/tree/v2.6.0).
Its source, checksum, and license are documented in `vendor/README.md`. D11_H support
was validated by that library's author; **printing on your physical printer has not
yet been verified here**. Web Bluetooth works in Chrome on macOS and Windows; Safari
does not provide the required API.

Sources: [Brewfather API](https://docs.brewfather.app/api),
[Chrome Web Bluetooth](https://developer.chrome.com/docs/capabilities/bluetooth),
[D11_H geometry](https://github.com/iscarelli/niimbot-web-bluetooth/blob/v2.6.0/registry.json).

## Development checks

```sh
node --test tests/core.test.cjs
python3 tests/serve.py
```

- Layout and settings: `http://127.0.0.1:8874/options.html`.
- Card integration: `http://127.0.0.1:8874/tabs/batches`.

The local card harness uses test API responses and a test printer driver; physical
printing is disabled. The harness is not included in the extension manifest, but is
included in the repository for contributors.

Verified: 9 automated tests covering metrics, missing values, geometry, IDs, unique
card matching, pagination, GET requests, and rotation; the live list of 106 batches
and metrics for #119 / #118 through the API; preview and batch switching in Chrome;
button locking during a job; and no navigation into a card when a print button is
clicked.

The extension is installed in the author's Chrome profile and the buttons were
checked on 32 cards in the live Brewfather list. Real Web Bluetooth from a content
script and the final physical print on a D11H remain hardware checks for the user.
