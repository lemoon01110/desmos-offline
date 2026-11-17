# Desmos Offline (unofficial)

A desktop app that runs the [Desmos](https://www.desmos.com) calculators **without internet**, with your
work saved as plain files on your own computer.

It covers every calculator in the Desmos API, switchable from the middle of the top bar:

| Calculator | Saves | Picture export | Dark mode |
|---|---|---|---|
| Graphing (2D) | yes | PNG, high-res PNG, SVG, clipboard | native |
| 3D | yes | PNG, clipboard | native |
| Geometry | yes | PNG, clipboard | inverted colours |
| Scientific | yes | – | inverted colours |
| Four Function | yes | – | inverted colours |

> **Not affiliated with Desmos.** This is a small shell around the official
> [Desmos API](https://www.desmos.com/api). The calculators themselves are Desmos's work. This repository
> does **not** contain any Desmos code: `npm run setup` downloads it from desmos.com onto your machine.

## What it adds around the calculators

- **Works offline.** After the one-time setup download, nothing needs the internet. The page is blocked from
  making any network request.
- **Autosave to files.** Every change is saved within a second as a `.json` file in `~/Documents/Desmos Graphs`
  (see [Settings](#settings) to change it). The app reopens your last graph.
- **Graph list.** The folder button (Ctrl+O) shows all your graphs and constructions, newest first, with
  previews and search. Deleting moves a file to the system Trash.
- **Bring in desmos.com links.** Paste a `desmos.com/calculator/…`, `/3d/…` or `/geometry/…` link to save
  a local copy (this one step needs internet).
- **Open any graph file**, including ones someone sent you.
- **Dark mode** (Ctrl+Shift+D) that follows your system theme until you pick one.
- **Picture export** (Ctrl+Shift+E) to PNG, high-resolution PNG, SVG, or straight to the clipboard.
- A top bar laid out like desmos.com: title (click to rename), a Save button that greys out when everything
  is saved, new graph (Ctrl+N).

## Install

Needs [Node.js](https://nodejs.org) 18 or newer.

```sh
git clone https://github.com/lemoon01110/desmos-offline.git
cd desmos-offline
npm install          # installs Electron
npm run setup        # downloads the Desmos calculator (needs internet once)
npm start
```

On Linux, `npm run install-desktop` adds **Desmos Offline** to your app menu and a `desmos-offline` command.

### API key

Desmos's API needs a key. `npm run setup` uses your own key if you set one:

```sh
DESMOS_API_KEY=your-key npm run setup
```

Without one it uses the public demo key from the Desmos API documentation, which Desmos describes as
suitable for prototyping and not for commercial use, and the calculator shows a small "Trial Key" notice
(click its ✕). Request your own key at <https://www.desmos.com/my-api>. Please respect the
[Desmos terms](https://www.desmos.com/terms) and do not redistribute the downloaded script.

`DESMOS_API_VERSION` picks the API version (default `v1.13`). Run `npm run setup` again to update.

## Settings

Settings live in `prefs.json` in the app's data folder (`~/.config/desmos-offline` on Linux,
`%APPDATA%\desmos-offline` on Windows, `~/Library/Application Support/desmos-offline` on macOS).

| Key | Meaning |
|---|---|
| `graphDir` | Folder for your graphs (default `~/Documents/Desmos Graphs`). The `DESMOS_GRAPH_DIR` environment variable overrides it. |
| `theme` | `"light"`, `"dark"` or `"system"` |

## File format

Each graph is one JSON file:

```json
{ "app": "desmos-offline", "version": 2, "kind": "graphing", "title": "…", "savedAt": "…",
  "thumbnail": "data:image/png;base64,…", "state": { "…": "Desmos calculator state" } }
```

`kind` is one of `graphing`, `3d`, `geometry`, `scientific`, `fourfunction`. `state` is exactly what the
Desmos API's `getState()` returns, so a file also opens in anything else built on the API.

## Keyboard shortcuts

| Keys | Action |
|---|---|
| Ctrl+N | New graph (same calculator) |
| Ctrl+O | Your graphs |
| Ctrl+S | Save now |
| Ctrl+Shift+E | Export picture |
| Ctrl+Shift+D | Dark mode |

## How it works

`main.js` (Electron) owns the files, the window and the single network request for link imports. The page
in `app/` loads the downloaded `app/vendor/calculator.js`, builds the chosen calculator, and talks to
`main.js` only through the small API in `preload.js`. A graph id is its file name, checked against a safe
character set so the page can never reach outside the graph folder.

## License

MIT for the code in this repository. The Desmos calculator script is not included and remains under Desmos's
own terms.
