# Security Policy

## Supported Versions

The latest `main` branch is the supported release line.

## Reporting a Vulnerability

Do not open a public issue for sensitive vulnerabilities.

1. Prepare a minimal report:
   - Impacted component/path
   - Reproduction steps
   - Expected vs actual behavior
   - Impact assessment
2. Send the report privately to the maintainer.
3. After triage, fix will be prepared and released.

## Security Controls in This Repository

- Secret scanning in CI (`.github/workflows/secret-scan.yml`)
- Build and check gates in CI (`.github/workflows/ci-build.yml`)
- Dependency vulnerability checks (`.github/workflows/security-audit.yml`)
- Dependency review on pull requests (`.github/workflows/dependency-review.yml`)
- CodeQL static analysis (`.github/workflows/codeql.yml`)
- Dependabot update automation (`.github/dependabot.yml`)

## Local Security Checks

Run these before pushing:

```bash
bash scripts/install_git_hooks.sh
bash scripts/secret_scan.sh --all
npm run build
```
