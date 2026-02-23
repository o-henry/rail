## Summary

- What changed:
- Why:

## Validation

- [ ] `npm run build` passes
- [ ] `bash scripts/secret_scan.sh --all` passes
- [ ] No token/secret/session value is added to logs or UI
- [ ] Bridge/security related changes reviewed carefully (if touched)

## Security Checklist

- [ ] Added dependencies are necessary and trusted
- [ ] High-risk files reviewed (`scripts/web_worker`, `extension/rail-bridge`, `src-tauri`, workflows)
- [ ] No external network endpoint was added without explicit need
