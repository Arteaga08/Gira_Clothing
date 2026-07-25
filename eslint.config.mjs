import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

// Layering guard (non-negotiable #2): controllers and routes must never import
// models directly — only services touch models. Enforced statically here.
const noModelImports = {
  files: ["apps/api/src/controllers/**/*.ts", "apps/api/src/routes/**/*.ts"],
  rules: {
    "no-restricted-imports": [
      "error",
      {
        patterns: [
          {
            group: ["**/models/*", "**/models"],
            message:
              "Controllers y routes no acceden a models directamente. Usa la capa services.",
          },
        ],
      },
    ],
  },
};

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/build/**",
      "**/coverage/**",
      "**/node_modules/**",
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
  noModelImports,
  {
    // Test files and config are looser: no type-checked linting noise.
    files: ["**/*.config.{ts,mjs,js}", "**/tests/**/*.ts"],
    ...tseslint.configs.disableTypeChecked,
  },
  prettier,
);
