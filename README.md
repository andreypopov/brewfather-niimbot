# Brewfather → Niimbot D11H

[![Tests](https://github.com/andreypopov/brewfather-niimbot/actions/workflows/test.yml/badge.svg)](https://github.com/andreypopov/brewfather-niimbot/actions/workflows/test.yml)
[![License](https://img.shields.io/github/license/andreypopov/brewfather-niimbot)](LICENSE)
[![Chrome MV3](https://img.shields.io/badge/Chrome-Manifest%20V3-4285F4?logo=googlechrome&logoColor=white)](https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3)
[![Latest version](https://img.shields.io/github/v/release/andreypopov/brewfather-niimbot?display_name=tag&include_prereleases)](https://github.com/andreypopov/brewfather-niimbot/releases)

Print a fresh Brewfather batch label on a **Niimbot D11H** directly from Chrome.
The extension adds one **Print label** button to each batch card, opens a live
preview, lets you choose the number of copies and whether to add a QR code, and
sends the final image over Bluetooth. It does not edit recipes, batches,
inventory, or fermentation data.

![Brewfather to Niimbot three-step workflow](docs/images/workflow.svg)

## The user experience

The first click is always a preview. Printing requires a second, explicit click,
so an accidental click on a batch card cannot waste a label.

<table>
  <tr>
    <td width="50%"><img src="docs/images/batch-button.svg" alt="Brewfather batch card with one Print label button"></td>
    <td width="50%"><img src="docs/images/label-preview.svg" alt="Example thermal label preview"></td>
  </tr>
  <tr>
    <td align="center"><sub>One button in the batch header</sub></td>
    <td align="center"><sub>Preview, copy count, and final print</sub></td>
  </tr>
</table>

The default roll is **40 × 14 mm**, with one copy and normal print density. The
label length, tape width, density, and feed offset are configurable. The copy
count is selected for each job in the preview panel, from 1 to 50. The optional
**Add QR** checkbox reserves a square on the label for a QR code that opens the
recipe's Brewfather share link. **Add QR code by default** in the extension
options controls the initial value for every new preview.

## Install in five minutes

Chrome loads this project as an unpacked extension. No server, build step, or
separate NIIMBOT phone app is required.

1. Download the [latest source ZIP](https://github.com/andreypopov/brewfather-niimbot/archive/refs/heads/main.zip), or clone the repository:

   ```sh
   git clone https://github.com/andreypopov/brewfather-niimbot.git
   ```

2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode**.
4. Click **Load unpacked** and select the folder that contains `manifest.json`.
5. Open **Details → Extension options** for **Brewfather → Niimbot D11H**.
6. Load your local `.env.local` file, or enter the two access fields manually.
7. Click **Save settings**, then reload the Brewfather tab.

The `.env.local` file is read locally by the options page. It is not part of this
repository and must never be committed. The API key only needs Brewfather's
**Read Batches** permission; edit permissions are not required.
The included [.env.example](.env.example) shows the expected variable names.

### Ready-to-download package

The repository also contains a credential-free package:

[Download `brewfather-niimbot-0.3.0.zip`](https://github.com/andreypopov/brewfather-niimbot/raw/main/dist/brewfather-niimbot-0.3.0.zip)

Unzip it first, then select the extracted `brewfather-niimbot` folder in **Load
unpacked**. The package contains only the files needed by the extension; tests and
local fixtures stay in the source repository.

For a full illustrated walkthrough, see [docs/INSTALL.md](docs/INSTALL.md).

## Print a label

1. Turn on the D11H and load the 40 × 14 mm roll, or choose the installed roll
   size in **Label settings**.
2. Close the NIIMBOT phone app if it is holding the Bluetooth connection.
3. In Brewfather, click **Print label** on the desired batch card.
4. Check the preview. Set **Copies**; it starts at `1` for every new preview.
5. Turn on **Add QR** when the recipe already has a Brewfather share link.
6. Click **Print**, then choose `D11_H` in Chrome's Bluetooth chooser.
7. If macOS asks, allow Chrome to use Bluetooth.

The extension refreshes the selected batch immediately before printing. While the
tab and connection remain open, later jobs can print from the preview panel
without choosing the device again. Chrome may ask again after a page reload,
printer shutdown, or Bluetooth disconnect.

## Label example

For batch **#119**, the preview contains:

```text
Citra American Pale Ale - 50 L
American Pale Ale
ABV ≈4.7%   IBU 47
OG 1.046   FG ≈1.010
#119 · 31.08.2026
```

The recipe name and style come from the recipe copy stored in the batch. Metrics
come from the batch: `measuredAbv`, `measuredOg`, `measuredFg`, and
`estimatedIbu`. When a measured value is missing or explicitly unset, the
extension falls back to the batch or recipe estimate. Values calculated from
incomplete measurements carry `≈`; unavailable values show `—`.

The bottom line contains the batch number and brew date in the
`Europe/London` time zone. The example above has no measured final gravity, so
the estimated FG and ABV remain marked as estimates until Brewfather has a final
measurement.

### QR code labels

When **Add QR** is checked, the renderer reads a public share URL already
present on the batch's recipe data and draws the QR code directly into the
preview. The code points to Brewfather's public share page, so a person can
open the recipe without signing in. Create or verify the recipe's **Share**
link in Brewfather before enabling the option. If no share link is available,
the preview explains the problem and the extension blocks the print until you
turn **Add QR** off or share the recipe.

## How batch matching works

Brewfather's list-card DOM does not expose a public batch ID. The extension:

1. Reads the visible batch number and complete recipe title from the card.
2. Matches both values against the batch list from the official Brewfather API.
3. Fetches the selected batch again immediately before printing.
4. Stops safely when the match is missing or ambiguous.

Opening an individual batch is a fallback when two list cards have the same number
and recipe title; the batch ID is available in that page's URL. The list index is
cached for five minutes, while the selected batch data is fetched fresh for each
job.

## Label geometry and printer support

- Target printer: **Niimbot D11H / D11_H, 300 dpi**.
- A 40 mm feed length is 472 dots at 300 dpi.
- The D11H print head is 144 dots wide (about 12.2 mm), including on 14–15 mm tape.
- The readable 472 × 144 layout is rotated to 144 × 472 before BLE transfer.
- The initial feed offset is zero; calibrate it for a particular roll if needed.
- Long lines are reduced to fit. If text still does not fit, the preview reports
  the problem and printing asks for a longer label.
- Web Locks prevents simultaneous jobs from separate Brewfather tabs.

Support comes from the vendored MIT-licensed
[niimbot-web-bluetooth 2.6.0](https://github.com/iscarelli/niimbot-web-bluetooth/tree/v2.6.0).
Its source, checksum, and license are documented in [vendor/README.md](vendor/README.md).
Chrome on macOS and Windows supports the required Web Bluetooth API; Safari does
not. Physical printing still needs to be checked with the user's own D11H and
label roll.

## Privacy and permissions

- The Brewfather key is kept in `chrome.storage.local` and is not synced.
- Requests go only to `https://api.brewfather.app/` and use `GET`.
- The extension never edits Brewfather data.
- There are no analytics, background servers, or third-party tracking services.
- The public repository and distribution ZIP contain no credentials.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| No **Print label** button | Click **Reload** on the extension card in `chrome://extensions`, then reload Brewfather. Make sure the current URL is `web.brewfather.app`. |
| Settings say access is missing | Reopen **Extension options**, load `.env.local` again, and click **Save settings**. The key needs **Read Batches** permission. |
| Bluetooth chooser is empty | Turn on the D11H, close the NIIMBOT phone app, keep Chrome near the printer, and try **Print** again. |
| The wrong roll size is shown | Open **Label settings**, change length or width, and preview the batch again before printing. |
| Text does not fit | Choose a longer label length or shorten the recipe name in Brewfather. The extension blocks a print with clipped text. |
| QR code is unavailable | Share the recipe in Brewfather, preview the batch again, or turn **Add QR** off for this job. |
| Chrome asks for the printer again | This is expected after a tab reload, browser restart, printer shutdown, or lost Bluetooth connection. |

## Development

Run the automated checks:

```sh
node --test tests/core.test.cjs
```

Run the credential-free browser harness:

```sh
python3 tests/serve.py
```

Then open:

- `http://127.0.0.1:8874/options.html` for the settings and layout preview.
- `http://127.0.0.1:8874/tabs/batches` for card buttons, preview, copy count, and
  the test printer driver.

The local harness never calls Brewfather and never sends a real Bluetooth job.
The package is rebuilt with:

```sh
python3 package.py
```

The current test suite covers metrics, missing values, geometry, IDs, unique card
matching, pagination, GET-only API requests, BLE rotation, share-link validation,
and QR rendering. The public GitHub Actions workflow runs the same tests on every
push.

## Repository map

| Path | Purpose |
| --- | --- |
| `manifest.json` | Chrome Manifest V3 entry point and permissions |
| `content.js` | Brewfather buttons, preview panel, copy input, QR option, and print flow |
| `label.js` | Label normalization, share-link extraction, QR/metrics rendering, and geometry |
| `api.js` / `background.js` | Read-only Brewfather API access in the trusted context |
| `options.html` / `options.js` | English settings page and local credential import |
| `vendor/` | Pinned Niimbot driver, local QR generator, and licenses |
| `tests/` | Automated tests and a credential-free browser harness |
| `docs/images/` | Documentation illustrations used in this README |

## License

The extension code is released under the [MIT License](LICENSE). The vendored
Niimbot driver retains its upstream license in `vendor/NIIMBOT-LICENSE`.
