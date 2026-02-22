# Security Policy

## Supported Versions

| Version | Supported |
| ------- | --------- |
| 1.x     | Yes       |

## Reporting a Vulnerability

If you discover a security vulnerability, please report it responsibly:

1. **Do NOT** open a public issue
2. Email: apolenkov@gmail.com
3. Include steps to reproduce and potential impact

You can expect an initial response within 48 hours.

## Security Measures

This project implements:

- Helmet security headers
- JWT authentication with global guard
- Rate limiting via @nestjs/throttler
- TypeScript strict mode with security ESLint rules
- Non-root Docker container with read-only filesystem
- Automated dependency updates via Dependabot
