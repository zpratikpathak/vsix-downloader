# Security Policy

## Overview

VSIX Downloader is a **client-side only** static web app. It does not run a backend and does not proxy or re-host Visual Studio Code extension packages. Downloads are requested by the user’s browser directly from Microsoft’s VS Code Marketplace.

## Supported versions

Only the latest code on the `main` branch (as deployed to GitHub Pages / Vercel) is supported with security fixes.

| Version | Supported |
|---------|-----------|
| `main` (latest) | ✅ |
| Older commits / forks | ❌ (please update) |

## What is in scope

Please report:

- Cross-site scripting (XSS) or HTML injection via Marketplace response data
- Open redirects or unsafe URL handling in share / download flows
- Supply-chain or dependency issues in third-party CDNs used by the app
- Leakage of secrets in the repository or CI workflows
- Misleading UI that could trick users into installing untrusted packages

## What is out of scope

- Bugs or malware **inside** third-party `.vsix` packages published on the Marketplace (report those to the extension author / Microsoft)
- Issues that require a compromised or malicious Marketplace response beyond normal sanitization expectations
- Denial-of-service against Microsoft’s Marketplace API

## Reporting a vulnerability

Please **do not** open a public GitHub issue for security-sensitive reports.

1. Email the maintainer via **[pratikpathak.com](https://pratikpathak.com/)** (prefer a private channel such as email or the contact form) and include:
   - A clear description of the issue
   - Steps to reproduce or a proof of concept
   - Impact assessment (who is affected, how severe)
   - Any suggested fix (optional)
2. You should receive an acknowledgment within **7 days**.
3. If the report is confirmed, a fix will be prioritized and a public disclosure coordinated after a patch is live (or after a reasonable window if the risk is low).

Thank you for helping keep users safe.
