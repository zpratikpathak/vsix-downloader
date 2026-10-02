# Contributing to VSIX Downloader

Thanks for helping improve this project. Small fixes, docs, and UX polish are just as welcome as new features.

## Development setup

This is a static site with no build toolchain required.

```bash
git clone https://github.com/zpratikpathak/vsix-downloader.git
cd vsix-downloader
```

Double-click `index.html` to open it in your favorite browser, then edit:

| File | Role |
|------|------|
| `index.html` | Structure, SEO, modals, FAQ |
| `script.js` | Marketplace API, search, downloads, themes |
| `style.css` | Themes, layout polish, motion |

## How to contribute

1. **Check existing issues**: someone may already be working on it.
2. **Open an issue** for larger ideas before coding (optional but helpful).
3. **Fork** the repo and create a branch from `main`:
   ```bash
   git checkout -b fix/short-description
   ```
4. **Make focused changes**: one concern per PR when possible.
5. **Test manually** in a modern browser:
   - Search by name, Marketplace URL, and `publisher.extension` ID
   - Open the version modal; filter by OS and release type
   - Download a `.vsix` and copy the CLI install command
   - Toggle themes and confirm they persist after refresh
6. **Open a pull request** against `main` with a short summary of *why* the change helps.

## Code guidelines

- Keep the stack **vanilla** (HTML / CSS / JS). Avoid adding a framework or bundler unless there is a strong, discussed reason.
- Match existing naming, formatting, and UI patterns.
- Escape any Marketplace-sourced strings before injecting into the DOM (see `escapeHTML` in `script.js`).
- Prefer progressive enhancement and accessible controls (`aria-*`, keyboard support, visible focus).
- Do not commit secrets, analytics injection keys, or large unrelated binaries.

## Reporting bugs

Include:

- Browser and OS
- Steps to reproduce
- What you expected vs what happened
- Extension name / ID if the bug is Marketplace-related
- Console errors (if any)

## Feature ideas

Useful directions:

- Accessibility and keyboard navigation
- Clearer empty / error states
- Better platform matching edge cases
- Documentation and translations
- Performance of large version lists

## Code of conduct

Be respectful and constructive. Harassment or bad-faith behavior will not be tolerated. Maintainers may close issues or PRs that violate this spirit.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
