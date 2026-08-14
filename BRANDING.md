# Adro Branding

Adro uses an independent product identity while preserving compatibility with the Code - OSS extension ecosystem.

## Product Identity

The canonical product identity is defined in [`product.json`](product.json):

- Display name: `Adro`
- Application and CLI name: `adro`
- User data folders: `.adro` and `.adro-shared`
- URL protocol: `adro://`
- Windows application identity: `Adro.Editor`
- Publisher: `Adro`

These identifiers should be treated as permanent once public builds are distributed.

## Windows Assets

The current Windows application assets are:

- `resources/win32/adro.ico`
- `resources/win32/adro_70x70.png`
- `resources/win32/adro_150x150.png`
- `src/vs/workbench/browser/media/adro-icon.png`

The previous Code OSS application icons remain in the repository as unreferenced compatibility assets until packaged Adro builds have been verified.

The AppX manifest currently uses `CN=Adro`. A release signing certificate with that exact subject, or a corresponding manifest update, is required before distributing signed AppX/MSIX packages.

## Assets Still Needed

A high-resolution transparent master logo is required before completing non-Windows packaging. It should be used to create:

- A macOS `.icns` application icon
- Linux PNG and XPM application icons
- Web/PWA icons at 192×192 and 512×512, plus a favicon
- High-resolution onboarding and empty-editor artwork
- Windows installer wizard bitmap variants

Do not upscale the existing 150×150 Windows tile image for release assets.

## Names That Must Remain

Do not mechanically replace internal or third-party identifiers such as:

- `vscode` extension APIs, URI schemes, environment variables, and command IDs
- `@vscode/*` package names
- GitHub Copilot, GitHub Authentication, and Microsoft Account branding
- Microsoft and GitHub service endpoints
- Microsoft copyright notices in inherited source files

Those names describe compatibility contracts, third-party products, or required upstream attribution rather than Adro branding.
