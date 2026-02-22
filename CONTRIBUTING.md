# Contributing

Thank you for your interest in contributing to myapp-hello!

## Getting Started

1. Fork the repository
2. Clone your fork and create a feature branch from `main`
3. Follow the [Development Guide](docs/development.md) for local setup

## Development Workflow

```bash
npm install
cp .env.example .env
npm run dev
```

## Before Submitting a PR

Run the full quality pipeline:

```bash
npx tsc --noEmit
npm run format:check
npm run lint
npm run test:coverage
npm run check:arch
```

All checks must pass before merging.

## Commit Messages

This project uses [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(scope): add new feature
fix(scope): fix a bug
docs(scope): update documentation
refactor(scope): restructure code without behavior change
test(scope): add or update tests
chore(scope): maintenance tasks
ci(scope): CI/CD changes
```

## Code Style

- TypeScript strict mode, no `any`, explicit return types
- 2 spaces, single quotes, no semicolons, trailing commas (Prettier)
- kebab-case filenames
- See [eslint.config.js](eslint.config.js) for full rules

## Architecture

Module boundaries are enforced by dependency-cruiser:

- `database/` must NOT import from `auth/` or `metrics/`
- Production code must NOT import from `__tests__/`
- No circular dependencies

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
