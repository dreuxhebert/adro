# Adro Developer Setup

This guide explains how to set up the Adro development environment on Windows and run Adro from source.

Adro is currently based on Code - OSS, so building it requires several development tools in addition to the normal Git/Node.js setup.

> Adro is currently in early development. This setup is intended for developers working directly on the project, not end users.

## 1. Clone the Adro Repository

Make sure Git is installed:

```powershell
git --version
```

Then clone Adro:

```powershell
git clone https://github.com/dreuxhebert/adro.git
cd adro
```

---

## 2. Install Node.js

Adro currently uses the Node.js version specified by the repository's `.nvmrc` file.

You can check it with:

```powershell
Get-Content .nvmrc
```

The current required version is:

```text
24.18.0
```

Install **Node.js 24.18.0 x64**.

After installing it, close and reopen PowerShell and verify:

```powershell
node --version
npm --version
```

Node should report:

```text
v24.18.0
```

> Do not substitute a different Node version unless the project's `.nvmrc` has been updated.

---

## 3. Install Visual Studio 2022

This is **Visual Studio**, not Visual Studio Code.

Visual Studio is the larger Microsoft development environment and provides the C++ compiler/build tools required by some of Adro's native Node dependencies.

Install:

**Visual Studio 2022 Community**

Open **Visual Studio Installer** and modify the Visual Studio 2022 installation.

### Required Workload

Install:

* **Desktop development with C++**

### Required Components

In the **Individual components** tab, make sure the appropriate Visual C++ build tools are installed, including:

* MSVC v143 C++ x64/x86 build tools
* Windows SDK
* C++ CMake tools for Windows
* MSVC v143 Spectre-mitigated libraries (x64/x86)

The **Spectre-mitigated libraries are important**. Without them, `npm install` can fail while compiling native VS Code dependencies with an error similar to:

```text
error MSB8040: Spectre-mitigated libraries are required for this project.
```

After installing/changing Visual Studio components, restart PowerShell before continuing.

---

## 4. Verify Python

Some native Node modules use `node-gyp`, which requires Python.

Check:

```powershell
python --version
```

If Python is not installed, install a current Python 3 release and make sure it is available from PowerShell.

---

## 5. Install Adro Dependencies

From the Adro directory:

```powershell
cd C:\path\to\adro
npm i
```

This will install a large number of packages and can take several minutes.

Adro/Code - OSS currently uses **npm** for this repository.

Do **not** use:

```powershell
yarn
```

The repository's pre-install script will reject Yarn.

You may see npm warnings about deprecated packages, funding, or dependency vulnerabilities. These warnings do not necessarily mean the installation failed.

What matters is that `npm i` completes successfully without a final `npm ERR!`.

---

## 6. Windows `findstr` Check

Before launching Adro, verify that Windows can find `findstr`:

```powershell
findstr /?
```

If the command displays FINDSTR help, everything is fine.

If PowerShell instead says:

```text
'findstr' is not recognized
```

temporarily add Windows System32 to the current PowerShell PATH:

```powershell
$env:Path += ";C:\Windows\System32"
```

Then verify again:

```powershell
findstr /?
```

This PATH change only applies to the current PowerShell session.

---

## 7. Compile Adro During Development

When actively developing Adro, open a PowerShell window and run:

```powershell
cd C:\path\to\adro
npm run watch
```

Leave this terminal running while developing.

The watcher continuously compiles source changes so edits to the Adro/Code - OSS source are reflected in the development build.

Think of this terminal as Adro's development compiler.

---

## 8. Launch Adro

Open a **second PowerShell window**.

Navigate to the repository:

```powershell
cd C:\path\to\adro
```

If your Windows PATH does not already include System32, run:

```powershell
$env:Path += ";C:\Windows\System32"
```

Then launch Adro:

```powershell
.\scripts\code.bat
```

The development version of Adro should open.

You should see **Adro Dev** in the application interface.

---

## Normal Development Workflow

When working on Adro, the normal setup is:

### Terminal 1

```powershell
cd C:\path\to\adro
npm run watch
```

Leave it running.

### Terminal 2

```powershell
cd C:\path\to\adro
$env:Path += ";C:\Windows\System32"
.\scripts\code.bat
```

Use Terminal 2 whenever you need to restart the Adro development application.

You do not necessarily need `npm run watch` just to launch an already-compiled build, but it should normally be running while actively modifying Adro.

---

### Spectre Libraries Error

If `npm i` reports:

```text
MSB8040: Spectre-mitigated libraries are required
```

Open **Visual Studio Installer → Visual Studio 2022 → Modify → Individual components** and install the MSVC v143 Spectre-mitigated libraries for x64/x86.

Then run:

```powershell
npm i
```

again.

---

### `findstr` is not recognized

Run:

```powershell
$env:Path += ";C:\Windows\System32"
```

Then try again.

---

### Native Module / `.node` Binding Errors

If Adro reports that a native binding such as a `.node` file cannot be found, the dependency installation may have failed or only partially completed.

Stop Adro and the watcher.

Remove `node_modules`:

```powershell
Remove-Item -Recurse -Force node_modules
```

Then reinstall:

```powershell
npm i
```

After installation succeeds:

```powershell
npm run watch
```

and launch Adro again.

## Adro AI backend

The first-party chat slice lives in `services/adro-api` and `extensions/adro-chat`. See [`AI_ARCHITECTURE.md`](AI_ARCHITECTURE.md) for the local backend, fake provider, and default Adro Chat flow.


## Upstream

Adro is based on the open-source Code - OSS project.

Microsoft's upstream Code - OSS repository:

https://github.com/microsoft/vscode

Adro is an independent project and is not affiliated with or endorsed by Microsoft.
