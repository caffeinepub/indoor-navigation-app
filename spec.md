# Indoor Navigation App

## Current State
Full-screen OSM navigation app for MREM campus with routing, search, map modes, and campus overlays.

## Requested Changes (Diff)

### Add
- A QR code share button (top-right or floating) that opens a modal/popover showing a QR code of the current app URL, so users can share the app by scanning the code.

### Modify
- Nothing

### Remove
- Nothing

## Implementation Plan
1. Install `qrcode.react` npm package for QR code generation.
2. Add a share/QR button to the UI (small icon button, unobtrusive).
3. On click, show a modal or popover with a QR code generated from `window.location.href`.
4. Style the modal to match the existing dark/map UI.
